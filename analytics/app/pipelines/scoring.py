"""Fase 6 — Score integrado, explicabilidad (SHAP) y optimización (NSGA-II).

PARTE A — Score integrado (0-100)
  Combina cinco señales precalculadas por inmueble en un score único:
    score = 100 * minmax(
        W_OPORTUNIDAD * prob_oportunidad
      + W_BRECHA      * (-brecha_norm)      (más subvalorado ⇒ mejor)
      + W_YIELD       * yield_bruto_norm
      + W_RIESGO      * (1 - riesgo_norm)   (bajo=0, medio=1, alto=2)
      + W_COMPS       * posicion_comp_norm  (debajo=1, encima=0)
    )
  Los pesos son configurables vía variables de entorno (SCORE_W_*). La
  normalización min-max se calcula por columna SOBRE el dataset de inmuebles
  con datos completos (los 4 atípicos de segmentos 2-3 quedan fuera; reciben
  score = NULL).

PARTE B — Explicabilidad con SHAP
  Reutiliza el modelo de valor de Fase 3 (best_model.joblib, un
  TransformedTargetRegressor que envuelve un XGBRegressor) y la librería shap
  (TreeExplainer sobre el XGBRegressor interno). Para cada inmueble persiste en
  analisis_inmueble.shap_json la contribución de cada feature, ordenada por
  abs(impact) descendente. Los SHAP explican el target en espacio log1p (el
  modelo se entrena sobre log del precio); el signo y la magnitud relativa de
  cada contribución son lo relevante para la interpretación.

PARTE C — Optimización multicriterio (NSGA-II / pymoo)
  Dado un filtro del usuario (presupuesto, zonas, tipos, tolerancia de riesgo)
  busca el frente de Pareto sobre los inmuebles candidatos optimizando a la vez:
    - maximizar yield_bruto  (se minimiza -yield_bruto)
    - minimizar precio
    - minimizar nivel de riesgo (encoded)
  Configurado para responder en < 10 s (pop ≤ 50, n_gen = 30, corte 8 s).

Uso como script:
    python3.11 -m app.pipelines.scoring
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import shap
import structlog
from sklearn.ensemble import RandomForestRegressor
from sklearn.tree import DecisionTreeRegressor
from xgboost import XGBRegressor
from pymoo.algorithms.moo.nsga2 import NSGA2
from pymoo.core.problem import ElementwiseProblem
from pymoo.operators.crossover.sbx import SBX
from pymoo.operators.mutation.pm import PM
from pymoo.operators.repair.rounding import RoundingRepair
from pymoo.operators.sampling.rnd import IntegerRandomSampling
from pymoo.termination import get_termination
from sqlalchemy import bindparam, text

from app.db import get_engine
from app.pipelines.modelos_valor import (
    FEATURES as FEATURES_VALOR,
    MODELO_PATH,
    PREPROC_PATH,
    preparar_features,
)

logger = structlog.get_logger(__name__)

NIVEL_MAP = {"bajo": 0, "medio": 1, "alto": 2}

# Modelos de árbol explicables exactamente con shap.TreeExplainer. El modelo de
# valor activo (Fase 3) suele ser XGBoost; si el mejor por RMSE fuera lineal, se
# usa un explicador agnóstico como respaldo.
TREE_MODELS = (XGBRegressor, RandomForestRegressor, DecisionTreeRegressor)
SHAP_BG_MAX = 100

# --- Parte A: pesos del score (configurables por entorno) ---
PESOS_DEFAULT: dict[str, float] = {
    "oportunidad": 0.30,
    "brecha": 0.25,
    "yield": 0.25,
    "riesgo": 0.10,
    "comps": 0.10,
}
ENV_PESOS: dict[str, str] = {
    "oportunidad": "SCORE_W_OPORTUNIDAD",
    "brecha": "SCORE_W_BRECHA",
    "yield": "SCORE_W_YIELD",
    "riesgo": "SCORE_W_RIESGO",
    "comps": "SCORE_W_COMPS",
}

# --- Parte C: configuración NSGA-II ---
RANDOM_STATE = 42
N_GEN = 30
POP_MAX = 50
MAX_SEGUNDOS = 8.0
FRENTE_MIN = 3
FRENTE_MAX = 20

MODELS_DIR = Path(MODELO_PATH).resolve().parent
SCORE_RESUMEN_PATH = MODELS_DIR / "score.json"

# Inmuebles "con datos completos": yield_bruto NOT NULL excluye los 4 atípicos
# de los segmentos 2-3 (sin indicador financiero), tal como exige la fase.
CARGA_SQL_SCORE = text(
    """
    SELECT
        i.id,
        a.prob_oportunidad,
        a.brecha,
        a.yield_bruto,
        a.nivel_riesgo,
        a.posicion_vs_mediana
    FROM inmueble i
    JOIN analisis_inmueble a ON a.inmueble_id = i.id
    WHERE a.yield_bruto IS NOT NULL
      AND a.prob_oportunidad IS NOT NULL
      AND a.brecha IS NOT NULL
    """
)

CARGA_SQL_SHAP = text(
    """
    SELECT
        i.id,
        i.tipo,
        i.area_m2,
        i.habitaciones,
        i.banos,
        a.dist_pot_m,
        a.dist_centrocentro_m,
        a.nivel_riesgo
    FROM inmueble i
    JOIN analisis_inmueble a ON a.inmueble_id = i.id
    WHERE a.yield_bruto IS NOT NULL
      AND i.area_m2 IS NOT NULL AND i.area_m2 > 0
    """
)

CARGA_SQL_CANDIDATOS = text(
    """
    SELECT
        i.id,
        i.tipo,
        i.precio,
        i.area_m2,
        a.zona_id,
        a.yield_bruto,
        a.nivel_riesgo,
        a.prob_oportunidad,
        a.score
    FROM inmueble i
    JOIN analisis_inmueble a ON a.inmueble_id = i.id
    WHERE a.yield_bruto IS NOT NULL
      AND i.precio IS NOT NULL
    """
)

CARGA_SQL_EXPLICACION = text(
    """
    SELECT
        a.score,
        a.prob_oportunidad,
        a.brecha,
        a.yield_bruto,
        a.shap_json
    FROM analisis_inmueble a
    WHERE a.inmueble_id = :id
    """
)


# ============================================================
# PARTE A — Score integrado
# ============================================================
def pesos_score() -> dict[str, float]:
    """Lee los pesos del score desde el entorno; usa los default si faltan."""
    pesos: dict[str, float] = {}
    for clave, env in ENV_PESOS.items():
        valor = os.environ.get(env)
        try:
            pesos[clave] = float(valor) if valor is not None else PESOS_DEFAULT[clave]
        except ValueError:
            logger.warning("score.peso_invalido", env=env, valor=valor)
            pesos[clave] = PESOS_DEFAULT[clave]
    return pesos


def _minmax(arr: np.ndarray) -> np.ndarray:
    """Normalización min-max robusta: si la columna es constante, devuelve 0s."""
    arr = np.asarray(arr, dtype=float)
    lo = float(np.nanmin(arr))
    hi = float(np.nanmax(arr))
    if hi - lo == 0:
        return np.zeros_like(arr)
    return (arr - lo) / (hi - lo)


def cargar_datos_score() -> pd.DataFrame:
    engine = get_engine()
    with engine.connect() as conn:
        df = pd.read_sql(CARGA_SQL_SCORE, conn)
    return df


def calcular_score() -> dict[str, Any]:
    """Calcula el score (0-100) de los inmuebles con datos completos, lo
    persiste en analisis_inmueble.score y deja NULL a los atípicos."""
    df = cargar_datos_score()
    if df.empty:
        raise ValueError(
            "No hay inmuebles con datos completos. Ejecute primero Fases 3-5."
        )

    pesos = pesos_score()

    prob = pd.to_numeric(df["prob_oportunidad"], errors="coerce").to_numpy(dtype=float)
    brecha = pd.to_numeric(df["brecha"], errors="coerce").to_numpy(dtype=float)
    yield_b = pd.to_numeric(df["yield_bruto"], errors="coerce").to_numpy(dtype=float)
    riesgo_enc = (
        df["nivel_riesgo"].map(NIVEL_MAP).fillna(0).to_numpy(dtype=float)
    )
    posicion = (df["posicion_vs_mediana"] == "debajo").astype(float).to_numpy()

    brecha_norm = _minmax(brecha)
    yield_norm = _minmax(yield_b)
    riesgo_norm = _minmax(riesgo_enc)

    compuesto = (
        pesos["oportunidad"] * prob
        + pesos["brecha"] * (-brecha_norm)
        + pesos["yield"] * yield_norm
        + pesos["riesgo"] * (1.0 - riesgo_norm)
        + pesos["comps"] * posicion
    )
    score = 100.0 * _minmax(compuesto)

    actualizados = _persistir_score(df["id"], score)
    anulados = _anular_score_incompletos()

    resumen = {
        "n_inmuebles": int(len(df)),
        "pesos": pesos,
        "score_min": round(float(np.min(score)), 2),
        "score_max": round(float(np.max(score)), 2),
        "score_avg": round(float(np.mean(score)), 2),
        "inmuebles_actualizados": actualizados,
        "inmuebles_sin_score": anulados,
    }
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    SCORE_RESUMEN_PATH.write_text(json.dumps(resumen, indent=2, ensure_ascii=False))

    logger.info(
        "score.fin",
        n=resumen["n_inmuebles"],
        avg=resumen["score_avg"],
        actualizados=actualizados,
    )
    return resumen


def _persistir_score(ids: pd.Series, score: np.ndarray) -> int:
    filas = [
        {"id": int(i), "s": float(round(s, 2))} for i, s in zip(ids, score)
    ]
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE analisis_inmueble SET score = :s, updated_at = now() "
                "WHERE inmueble_id = :id"
            ),
            filas,
        )
    return len(filas)


def _anular_score_incompletos() -> int:
    """Los inmuebles sin yield_bruto (atípicos segmentos 2-3) no reciben score."""
    engine = get_engine()
    with engine.begin() as conn:
        result = conn.execute(
            text(
                "UPDATE analisis_inmueble SET score = NULL, updated_at = now() "
                "WHERE yield_bruto IS NULL AND score IS NOT NULL"
            )
        )
    return int(result.rowcount or 0)


# ============================================================
# PARTE B — Explicabilidad con SHAP
# ============================================================
def _construir_explicador(regressor, X: np.ndarray):
    """Devuelve un callable X→matriz de valores SHAP. Usa TreeExplainer (exacto)
    para modelos de árbol y un explicador agnóstico para el resto."""
    if isinstance(regressor, TREE_MODELS):
        tree = shap.TreeExplainer(regressor)
        return lambda data: np.asarray(tree.shap_values(data))
    background = (
        X
        if len(X) <= SHAP_BG_MAX
        else shap.utils.sample(X, SHAP_BG_MAX, random_state=RANDOM_STATE)
    )
    agnostico = shap.Explainer(regressor.predict, background)
    return lambda data: np.asarray(agnostico(data).values)


def calcular_shap() -> dict[str, Any]:
    """Calcula valores SHAP del modelo de valor para cada inmueble con datos
    completos y los persiste en analisis_inmueble.shap_json."""
    if not MODELO_PATH.exists() or not PREPROC_PATH.exists():
        raise FileNotFoundError(
            "Falta el modelo de valor. Ejecute POST /analytics/entrenar (Fase 3)."
        )

    engine = get_engine()
    with engine.connect() as conn:
        df = pd.read_sql(CARGA_SQL_SHAP, conn)
    if df.empty:
        raise ValueError("No hay inmuebles con datos completos para explicar.")

    df = preparar_features(df_con_precio_dummy(df))

    modelo = joblib.load(MODELO_PATH)
    preprocessor = joblib.load(PREPROC_PATH)
    # regressor_ es el estimador interno del TransformedTargetRegressor (Fase 3).
    regressor = getattr(modelo, "regressor_", modelo)

    X = preprocessor.transform(df[FEATURES_VALOR])
    explicador = _construir_explicador(regressor, X)
    shap_values = explicador(X)

    filas = []
    for fila_idx, inmueble_id in enumerate(df["id"]):
        contribuciones = [
            {
                "feature": feat,
                "value": round(float(X[fila_idx, col]), 4),
                "impact": round(float(shap_values[fila_idx, col]), 6),
            }
            for col, feat in enumerate(FEATURES_VALOR)
        ]
        contribuciones.sort(key=lambda c: abs(c["impact"]), reverse=True)
        filas.append({"id": int(inmueble_id), "sj": json.dumps(contribuciones)})

    actualizados = _persistir_shap(filas)
    # Limpia shap_json de inmuebles que ya no tienen datos completos (p. ej. tras
    # crecer/cambiar el dataset), para que el set explicado sea siempre el actual.
    anulados = _anular_shap_no_procesados([f["id"] for f in filas])
    resumen = {
        "n_inmuebles": int(len(df)),
        "inmuebles_sin_shap": anulados,
        "features": FEATURES_VALOR,
        "espacio_target": "log1p(precio)",
        "inmuebles_actualizados": actualizados,
    }
    logger.info("shap.fin", n=resumen["n_inmuebles"], actualizados=actualizados)
    return resumen


def df_con_precio_dummy(df: pd.DataFrame) -> pd.DataFrame:
    """preparar_features() necesita la columna precio para derivar precio_m2;
    para SHAP no predecimos precio, así que basta un placeholder no usado."""
    df = df.copy()
    df["precio"] = 1.0
    return df


def _persistir_shap(filas: list[dict[str, Any]]) -> int:
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE analisis_inmueble "
                "SET shap_json = CAST(:sj AS jsonb), updated_at = now() "
                "WHERE inmueble_id = :id"
            ),
            filas,
        )
    return len(filas)


def _anular_shap_no_procesados(ids_procesados: list[int]) -> int:
    """Pone shap_json = NULL en los inmuebles que no se explicaron en esta
    corrida (sin datos completos), manteniendo el set coherente."""
    if not ids_procesados:
        return 0
    stmt = text(
        "UPDATE analisis_inmueble SET shap_json = NULL, updated_at = now() "
        "WHERE shap_json IS NOT NULL AND inmueble_id NOT IN :ids"
    ).bindparams(bindparam("ids", expanding=True))
    engine = get_engine()
    with engine.begin() as conn:
        result = conn.execute(stmt, {"ids": ids_procesados})
    return int(result.rowcount or 0)


def cargar_explicacion(inmueble_id: int) -> dict[str, Any] | None:
    """Devuelve score, prob_oportunidad, brecha, yield_bruto y shap_json de un
    inmueble; None si no existe o no tiene análisis."""
    engine = get_engine()
    with engine.connect() as conn:
        fila = conn.execute(CARGA_SQL_EXPLICACION, {"id": inmueble_id}).mappings().first()
    if fila is None:
        return None
    return {
        "inmueble_id": inmueble_id,
        "score": None if fila["score"] is None else float(fila["score"]),
        "prob_oportunidad": (
            None if fila["prob_oportunidad"] is None else float(fila["prob_oportunidad"])
        ),
        "brecha": None if fila["brecha"] is None else float(fila["brecha"]),
        "yield_bruto": None if fila["yield_bruto"] is None else float(fila["yield_bruto"]),
        "shap_json": fila["shap_json"],
    }


# ============================================================
# PARTE C — Optimización multicriterio NSGA-II
# ============================================================
class CarteraProblem(ElementwiseProblem):
    """Cada variable de decisión es el índice de un inmueble candidato; el
    problema minimiza simultáneamente -yield, precio y nivel de riesgo."""

    def __init__(
        self, yields: np.ndarray, precios: np.ndarray, riesgos: np.ndarray
    ) -> None:
        self._yields = yields
        self._precios = precios
        self._riesgos = riesgos
        super().__init__(
            n_var=1,
            n_obj=3,
            n_ieq_constr=0,
            xl=0,
            xu=len(yields) - 1,
            vtype=int,
        )

    def _evaluate(self, x, out, *args, **kwargs) -> None:  # noqa: ANN001
        i = int(round(float(x[0])))
        i = max(0, min(i, len(self._yields) - 1))
        out["F"] = [-self._yields[i], self._precios[i], self._riesgos[i]]


def _filtrar_candidatos(
    df: pd.DataFrame,
    presupuesto_max: float | None,
    zona_ids: list[int] | None,
    tipos: list[str] | None,
    tolerancia_riesgo: str,
) -> pd.DataFrame:
    df = df.copy()
    df["precio"] = pd.to_numeric(df["precio"], errors="coerce")
    df["yield_bruto"] = pd.to_numeric(df["yield_bruto"], errors="coerce")
    df["riesgo_encoded"] = df["nivel_riesgo"].map(NIVEL_MAP).fillna(0).astype(int)

    mask = df["precio"].notna() & df["yield_bruto"].notna()
    if presupuesto_max is not None:
        mask &= df["precio"] <= float(presupuesto_max)
    if zona_ids:
        mask &= df["zona_id"].isin(zona_ids)
    if tipos:
        mask &= df["tipo"].isin(tipos)
    tol = NIVEL_MAP.get((tolerancia_riesgo or "alto").lower(), 2)
    mask &= df["riesgo_encoded"] <= tol
    return df.loc[mask].reset_index(drop=True)


def optimizar(
    presupuesto_max: float | None = None,
    zona_ids: list[int] | None = None,
    tipos: list[str] | None = None,
    tolerancia_riesgo: str = "alto",
) -> dict[str, Any]:
    """Frente de Pareto (NSGA-II) sobre los inmuebles que cumplen el filtro."""
    inicio = time.time()
    engine = get_engine()
    with engine.connect() as conn:
        df = pd.read_sql(CARGA_SQL_CANDIDATOS, conn)

    cand = _filtrar_candidatos(
        df, presupuesto_max, zona_ids, tipos, tolerancia_riesgo
    )
    n = len(cand)
    if n == 0:
        return {
            "n_candidatos": 0,
            "frente": [],
            "mensaje": "Ningún inmueble cumple los criterios indicados.",
            "segundos": round(time.time() - inicio, 3),
        }

    yields = cand["yield_bruto"].to_numpy(dtype=float)
    precios = cand["precio"].to_numpy(dtype=float)
    riesgos = cand["riesgo_encoded"].to_numpy(dtype=float)

    indices = _resolver_frente(yields, precios, riesgos, n)
    indices = _ajustar_tamano_frente(indices, yields, n)

    frente = [_fila_frente(cand.iloc[i]) for i in indices]
    frente.sort(key=lambda f: f["yield_bruto"], reverse=True)

    resultado = {
        "n_candidatos": n,
        "n_frente": len(frente),
        "frente": frente,
        "segundos": round(time.time() - inicio, 3),
    }
    logger.info(
        "optimizar.fin",
        n_candidatos=n,
        n_frente=len(frente),
        segundos=resultado["segundos"],
    )
    return resultado


def _resolver_frente(
    yields: np.ndarray, precios: np.ndarray, riesgos: np.ndarray, n: int
) -> list[int]:
    """Corre NSGA-II con corte por n_gen y por tiempo (8 s) y devuelve los
    índices no dominados. Con un solo inmueble candidato, evita el optimizador."""
    if n == 1:
        return [0]

    problem = CarteraProblem(yields, precios, riesgos)
    algorithm = NSGA2(
        pop_size=min(POP_MAX, n),
        sampling=IntegerRandomSampling(),
        crossover=SBX(prob=0.9, eta=15, repair=RoundingRepair()),
        mutation=PM(prob=1.0, eta=20, repair=RoundingRepair()),
        eliminate_duplicates=True,
    )
    algorithm.setup(
        problem,
        termination=get_termination("n_gen", N_GEN),
        seed=RANDOM_STATE,
        verbose=False,
    )
    inicio = time.time()
    while algorithm.has_next():
        if time.time() - inicio > MAX_SEGUNDOS:
            break
        algorithm.next()
    res = algorithm.result()

    if res.X is None:
        return []
    X = np.atleast_2d(res.X)
    indices = {int(round(float(fila[0]))) for fila in X}
    return sorted(idx for idx in indices if 0 <= idx < n)


def _ajustar_tamano_frente(
    indices: list[int], yields: np.ndarray, n: int
) -> list[int]:
    """Garantiza FRENTE_MIN..FRENTE_MAX inmuebles. Si NSGA-II devuelve menos de
    FRENTE_MIN (frente pequeño), completa con los mejores por yield; si devuelve
    más de FRENTE_MAX, conserva los de mayor yield."""
    indices = list(dict.fromkeys(indices))
    orden_yield = list(np.argsort(-yields))

    if len(indices) < FRENTE_MIN:
        objetivo = min(FRENTE_MIN, n)
        for idx in orden_yield:
            if len(indices) >= objetivo:
                break
            if idx not in indices:
                indices.append(idx)
    elif len(indices) > FRENTE_MAX:
        rank = {idx: pos for pos, idx in enumerate(orden_yield)}
        indices = sorted(indices, key=lambda i: rank[i])[:FRENTE_MAX]
    return indices


def _fila_frente(fila: pd.Series) -> dict[str, Any]:
    return {
        "inmueble_id": int(fila["id"]),
        "tipo": fila["tipo"],
        "precio": float(fila["precio"]),
        "area_m2": None if pd.isna(fila["area_m2"]) else float(fila["area_m2"]),
        "zona_id": None if pd.isna(fila["zona_id"]) else int(fila["zona_id"]),
        "yield_bruto": float(fila["yield_bruto"]),
        "nivel_riesgo": fila["nivel_riesgo"],
        "prob_oportunidad": (
            None if pd.isna(fila["prob_oportunidad"]) else float(fila["prob_oportunidad"])
        ),
        "score": None if pd.isna(fila["score"]) else float(fila["score"]),
    }


def cargar_resumen_score() -> dict[str, Any] | None:
    if not SCORE_RESUMEN_PATH.exists():
        return None
    return json.loads(SCORE_RESUMEN_PATH.read_text())


if __name__ == "__main__":
    from app.logging_config import configure_logging

    configure_logging()
    print(json.dumps(calcular_score(), indent=2, ensure_ascii=False))
    print(json.dumps(calcular_shap(), indent=2, ensure_ascii=False))
    print(json.dumps(optimizar(presupuesto_max=500_000_000), indent=2, ensure_ascii=False))
