"""Fase 5 — Oportunidad y finanzas.

PARTE A — Clasificador de oportunidad
  1. Carga inmueble + analisis_inmueble (brecha, posicion_vs_mediana,
     dist_pot_m, nivel_riesgo, segmento, dist_centrocentro_m).
  2. Etiqueta `oportunidad = 1` cuando brecha < -10 (subvalorado >10%),
     posicion_vs_mediana == 'debajo' y nivel_riesgo != 'alto'. Con el dataset
     piloto esto produce ~25 positivos sobre 302 (~8%), un desbalance
     intencional propio del piloto.
  3. Entrena un Pipeline StandardScaler + LogisticRegression
     (class_weight='balanced') y evalúa con cross_val_score(cv=5, AUC).
  4. Reentrena sobre todo el dataset, predice prob_oportunidad para los 302
     inmuebles y los persiste en analisis_inmueble.
  5. Serializa el pipeline completo en analytics/app/models/.

PARTE B — Capa financiera
  Aplica ratios canon/precio mensuales estándar del mercado colombiano por
  segmento (0.5% para segmento 0, 0.45% para segmento 1; los segmentos 2 y 3
  son outliers extremos y se excluyen). El ratio es constante por segmento
  (no varía por zona dentro del rango piloto), así que los inmuebles sin
  zona_id reciben automáticamente el ratio de su segmento. Para cada
  inmueble calcula y persiste:
    - canon_estimado_mensual = precio * ratio_segmento
    - yield_bruto            = (canon_estimado_mensual * 12) / precio * 100
    - cap_rate               = yield_bruto * 0.85 (85% de eficiencia operativa)

Uso como script:
    python3.11 -m app.pipelines.oportunidad_finanzas
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import structlog
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sqlalchemy import text

from app.db import get_engine

logger = structlog.get_logger(__name__)

# --- Parte A: clasificador de oportunidad ---
NIVEL_MAP = {"bajo": 0, "medio": 1, "alto": 2}
UMBRAL_BRECHA = -10.0
RANDOM_STATE = 42
CV_FOLDS = 5

FEATURES_OPORTUNIDAD: list[str] = [
    "brecha",
    "posicion_encoded",
    "dist_pot_m",
    "nivel_riesgo_encoded",
    "segmento",
    "dist_centrocentro_m",
]

# --- Parte B: capa financiera ---
# Ratio canon mensual / precio, por segmento (estándar mercado colombiano).
# Segmentos 2 y 3 agrupan outliers extremos (Fase 4) y se excluyen.
RATIOS_SEGMENTO: dict[int, float] = {0: 0.005, 1: 0.0045}
CAP_RATE_FACTOR = 0.85

MODELS_DIR = Path(__file__).resolve().parents[1] / "models"
CLASIFICADOR_PATH = MODELS_DIR / "clasificador_oportunidad.joblib"
OPORTUNIDAD_RESUMEN_PATH = MODELS_DIR / "oportunidad.json"
FINANCIERO_RESUMEN_PATH = MODELS_DIR / "financiero.json"

CARGA_SQL_OPORTUNIDAD = text(
    """
    SELECT
        i.id,
        a.brecha,
        a.posicion_vs_mediana,
        a.dist_pot_m,
        a.dist_centrocentro_m,
        a.nivel_riesgo,
        a.segmento
    FROM inmueble i
    JOIN analisis_inmueble a ON a.inmueble_id = i.id
    WHERE a.brecha IS NOT NULL
      AND a.posicion_vs_mediana IS NOT NULL
      AND a.segmento IS NOT NULL
      AND a.dist_pot_m IS NOT NULL
      AND a.dist_centrocentro_m IS NOT NULL
    """
)

CARGA_SQL_FINANCIERO = text(
    """
    SELECT
        i.id,
        i.precio,
        a.segmento
    FROM inmueble i
    JOIN analisis_inmueble a ON a.inmueble_id = i.id
    WHERE i.precio IS NOT NULL
      AND a.segmento IS NOT NULL
    """
)


def cargar_datos_oportunidad() -> pd.DataFrame:
    engine = get_engine()
    with engine.connect() as conn:
        df = pd.read_sql(CARGA_SQL_OPORTUNIDAD, conn)
    return df


def preparar_features_oportunidad(df: pd.DataFrame) -> pd.DataFrame:
    """Encodea categóricas y castea numéricos (vienen como Decimal)."""
    df = df.copy()
    df["brecha"] = pd.to_numeric(df["brecha"], errors="coerce")
    df["dist_pot_m"] = pd.to_numeric(df["dist_pot_m"], errors="coerce")
    df["dist_centrocentro_m"] = pd.to_numeric(df["dist_centrocentro_m"], errors="coerce")
    df["posicion_encoded"] = (df["posicion_vs_mediana"] == "debajo").astype(int)
    # nivel_riesgo NULL ⇒ sin riesgo registrado ⇒ 0 (bajo)
    df["nivel_riesgo_encoded"] = df["nivel_riesgo"].map(NIVEL_MAP).fillna(0).astype(int)
    return df


def etiquetar_oportunidad(df: pd.DataFrame) -> pd.DataFrame:
    """oportunidad = 1 si subvalorado (>10%), por debajo de sus comparables y
    sin riesgo alto. nivel_riesgo NULL se trata como 'bajo' (no 'alto')."""
    df = df.copy()
    df["oportunidad"] = (
        (df["brecha"] < UMBRAL_BRECHA)
        & (df["posicion_vs_mediana"] == "debajo")
        & (df["nivel_riesgo"].fillna("bajo") != "alto")
    ).astype(int)
    return df


def _persistir_prob_oportunidad(ids: pd.Series, prob: np.ndarray) -> int:
    filas = [
        {"id": int(i), "p": float(round(p, 4))} for i, p in zip(ids, prob)
    ]
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE analisis_inmueble SET prob_oportunidad = :p, updated_at = now() "
                "WHERE inmueble_id = :id"
            ),
            filas,
        )
    return len(filas)


def clasificar() -> dict[str, Any]:
    """Entrena el clasificador de oportunidad, evalúa con CV (AUC), persiste
    prob_oportunidad para todos los inmuebles y serializa el pipeline."""
    df = cargar_datos_oportunidad()
    df = preparar_features_oportunidad(df)
    df = etiquetar_oportunidad(df)

    X = df[FEATURES_OPORTUNIDAD].to_numpy(dtype=float)
    y = df["oportunidad"].to_numpy(dtype=int)

    pipeline = Pipeline(
        [
            ("scaler", StandardScaler()),
            (
                "clf",
                LogisticRegression(
                    class_weight="balanced",
                    max_iter=1000,
                    random_state=RANDOM_STATE,
                ),
            ),
        ]
    )

    cv_scores = cross_val_score(pipeline, X, y, cv=CV_FOLDS, scoring="roc_auc")
    auc_cv = float(cv_scores.mean())
    logger.info(
        "oportunidad.cv_auc",
        auc_promedio=round(auc_cv, 4),
        scores=[round(float(s), 4) for s in cv_scores],
    )

    pipeline.fit(X, y)
    prob = pipeline.predict_proba(X)[:, 1]

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, CLASIFICADOR_PATH)

    actualizados = _persistir_prob_oportunidad(df["id"], prob)

    resumen = {
        "n_inmuebles": int(len(df)),
        "n_oportunidades": int(df["oportunidad"].sum()),
        "umbral_brecha": UMBRAL_BRECHA,
        "auc_cv_mean": round(auc_cv, 4),
        "auc_cv_scores": [round(float(s), 4) for s in cv_scores],
        "features": FEATURES_OPORTUNIDAD,
        "inmuebles_actualizados": actualizados,
    }
    OPORTUNIDAD_RESUMEN_PATH.write_text(json.dumps(resumen, indent=2, ensure_ascii=False))

    logger.info(
        "oportunidad.fin",
        n_oportunidades=resumen["n_oportunidades"],
        auc_cv_mean=resumen["auc_cv_mean"],
        actualizados=actualizados,
    )
    return resumen


def _persistir_financiero(df: pd.DataFrame) -> int:
    filas = [
        {
            "id": int(r.id),
            "canon": None if pd.isna(r.canon_estimado_mensual) else float(round(r.canon_estimado_mensual, 2)),
            "yld": None if pd.isna(r.yield_bruto) else float(round(r.yield_bruto, 3)),
            "cap": None if pd.isna(r.cap_rate) else float(round(r.cap_rate, 3)),
        }
        for r in df.itertuples()
    ]
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE analisis_inmueble "
                "SET canon_estimado_mensual = :canon, yield_bruto = :yld, "
                "    cap_rate = :cap, updated_at = now() "
                "WHERE inmueble_id = :id"
            ),
            filas,
        )
    return len(filas)


def calcular_financiero() -> dict[str, Any]:
    """Calcula canon_estimado_mensual, yield_bruto y cap_rate por inmueble
    usando el ratio estándar de su segmento; excluye segmentos 2 y 3."""
    df = cargar_datos_financiero()
    df["precio"] = pd.to_numeric(df["precio"], errors="coerce")
    df["ratio"] = df["segmento"].map(RATIOS_SEGMENTO)

    con_ratio = df["ratio"].notna()
    df["canon_estimado_mensual"] = np.where(
        con_ratio, df["precio"] * df["ratio"], np.nan
    )
    df["yield_bruto"] = np.where(con_ratio, df["ratio"] * 12 * 100, np.nan)
    df["cap_rate"] = np.where(con_ratio, df["yield_bruto"] * CAP_RATE_FACTOR, np.nan)

    actualizados = _persistir_financiero(df)

    calculados = df.loc[con_ratio]
    resumen = {
        "n_inmuebles": int(len(df)),
        "n_calculados": int(con_ratio.sum()),
        "n_excluidos": int((~con_ratio).sum()),
        "ratios_segmento": RATIOS_SEGMENTO,
        "cap_rate_factor": CAP_RATE_FACTOR,
        "yield_bruto_promedio": round(float(calculados["yield_bruto"].mean()), 3),
        "cap_rate_promedio": round(float(calculados["cap_rate"].mean()), 3),
        "canon_estimado_mensual_promedio": round(
            float(calculados["canon_estimado_mensual"].mean()), 2
        ),
        "inmuebles_actualizados": actualizados,
    }
    FINANCIERO_RESUMEN_PATH.write_text(json.dumps(resumen, indent=2, ensure_ascii=False))

    logger.info(
        "financiero.fin",
        n_calculados=resumen["n_calculados"],
        n_excluidos=resumen["n_excluidos"],
        yield_bruto_promedio=resumen["yield_bruto_promedio"],
        cap_rate_promedio=resumen["cap_rate_promedio"],
    )
    return resumen


def cargar_datos_financiero() -> pd.DataFrame:
    engine = get_engine()
    with engine.connect() as conn:
        df = pd.read_sql(CARGA_SQL_FINANCIERO, conn)
    return df


def cargar_resumen_oportunidad() -> dict[str, Any] | None:
    """Devuelve el resumen del último entrenamiento del clasificador, o None."""
    if not OPORTUNIDAD_RESUMEN_PATH.exists():
        return None
    return json.loads(OPORTUNIDAD_RESUMEN_PATH.read_text())


def cargar_resumen_financiero() -> dict[str, Any] | None:
    """Devuelve el resumen del último cálculo financiero, o None."""
    if not FINANCIERO_RESUMEN_PATH.exists():
        return None
    return json.loads(FINANCIERO_RESUMEN_PATH.read_text())


if __name__ == "__main__":
    from app.logging_config import configure_logging

    configure_logging()
    print(json.dumps(clasificar(), indent=2, ensure_ascii=False))
    print(json.dumps(calcular_financiero(), indent=2, ensure_ascii=False))
