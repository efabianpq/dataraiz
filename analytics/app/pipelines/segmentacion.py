"""Fase 4 — Segmentación y comparables.

Pipeline de segmentación de mercado y construcción de comparables:

PARTE A — Segmentación
  1. Carga inmueble + variables espaciales + valor (analisis_inmueble).
  2. Construye features (mismas del modelo de valor + precio_m2/valor_estimado/
     brecha), encodea categóricas e imputa numéricos faltantes por la mediana
     por tipo.
  3. Normaliza con StandardScaler y reduce dimensionalidad con PCA(5).
  4. Prueba K-means con k=3,4,5,6 y selecciona el de mayor coeficiente de
     silueta (sobre el espacio PCA).
  5. Asigna `segmento` a cada inmueble en analisis_inmueble.
  6. Serializa scaler, PCA y K-means en analytics/app/models/.

PARTE B — Comparables
  Para cada inmueble busca los 5 más similares en espacio PCA:
  1. Mismo tipo de inmueble.
  2. Misma zona o zona adyacente (±1); si hay menos de 5, amplía a todas las
     zonas del mismo segmento; si aún hay menos, a todo el tipo.
  3. Mide similitud por distancia euclidiana en espacio PCA.
  4. Persiste en `comparable`: distancia_pca, dif_precio_m2 y posicion_vs_mediana
     (posición del comparable respecto a la mediana de precio_m2 del conjunto).
  5. Marca en analisis_inmueble.posicion_vs_mediana la posición del propio
     inmueble respecto a la mediana de sus comparables ('debajo' = oportunidad).

Como los inmuebles del piloto se capturaron en una sola fecha, la recencia no
aplica y la similitud PCA es el único criterio de comparables.

Uso como script:
    python3.11 -m app.pipelines.segmentacion
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import structlog
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import silhouette_score
from sklearn.metrics.pairwise import euclidean_distances
from sklearn.preprocessing import StandardScaler
from sqlalchemy import text

from app.db import get_engine

logger = structlog.get_logger(__name__)

# --- Features de segmentación (mismas del modelo de valor + valor/brecha) ---
FEATURES: list[str] = [
    "area_m2",
    "habitaciones",
    "tipo_encoded",
    "dist_pot_m",
    "dist_centrocentro_m",
    "nivel_riesgo_encoded",
    "precio_m2",
    "valor_estimado",
    "brecha",
]

TIPO_MAP = {"apto": 0, "casa": 1, "lote": 2, "local": 3}
NIVEL_MAP = {"bajo": 0, "medio": 1, "alto": 2}

RANDOM_STATE = 42
N_COMPONENTS = 5
K_CANDIDATOS = [3, 4, 5, 6]
N_COMPARABLES = 5
# Diferencias de silueta por debajo de esta tolerancia relativa son ruido; ante
# un cuasi-empate preferimos el k más parsimonioso (segmentos más grandes y
# accionables, sin clusters degenerados de 1 inmueble).
TOL_SILUETA = 0.005

MODELS_DIR = Path(__file__).resolve().parents[1] / "models"
SCALER_PATH = MODELS_DIR / "scaler_segmentacion.joblib"
PCA_PATH = MODELS_DIR / "pca_model.joblib"
KMEANS_PATH = MODELS_DIR / "kmeans_model.joblib"
RESUMEN_PATH = MODELS_DIR / "segmentacion.json"

CARGA_SQL = text(
    """
    SELECT
        i.id,
        i.tipo,
        i.precio,
        i.area_m2,
        i.habitaciones,
        a.dist_pot_m,
        a.dist_centrocentro_m,
        a.nivel_riesgo,
        a.zona_id,
        a.valor_estimado,
        a.brecha
    FROM inmueble i
    JOIN analisis_inmueble a ON a.inmueble_id = i.id
    WHERE i.precio IS NOT NULL
      AND i.area_m2 IS NOT NULL AND i.area_m2 > 0
      AND a.valor_estimado IS NOT NULL
    """
)


@dataclass
class ResultadoSegmentacion:
    k: int
    silueta: float
    n_inmuebles: int
    conteo_por_segmento: dict[int, int]
    siluetas_por_k: dict[int, float]
    comparables_insertados: int


def cargar_datos() -> pd.DataFrame:
    engine = get_engine()
    with engine.connect() as conn:
        df = pd.read_sql(CARGA_SQL, conn)
    return df


def preparar_features(df: pd.DataFrame) -> pd.DataFrame:
    """Calcula precio_m2, encodea categóricas e imputa numéricos por la mediana
    por tipo. Las columnas valor_estimado/brecha vienen de analisis_inmueble."""
    df = df.copy()
    df["precio_m2"] = df["precio"] / df["area_m2"]
    df["tipo_encoded"] = df["tipo"].map(TIPO_MAP)
    # nivel_riesgo NULL ⇒ sin riesgo ⇒ 0 (bajo/none)
    df["nivel_riesgo_encoded"] = df["nivel_riesgo"].map(NIVEL_MAP).fillna(0)

    # Castea numéricos (vienen como Decimal desde PostgreSQL) e imputa faltantes
    # con la mediana por tipo (red de seguridad; el piloto está completo).
    num_cols = [
        "area_m2",
        "habitaciones",
        "dist_pot_m",
        "dist_centrocentro_m",
        "precio_m2",
        "valor_estimado",
        "brecha",
    ]
    for col in num_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")
        df[col] = df.groupby("tipo")[col].transform(lambda s: s.fillna(s.median()))
    # Salvaguarda final: si algún tipo quedó completamente vacío en una columna.
    df[num_cols] = df[num_cols].fillna(df[num_cols].median())
    return df


def _seleccionar_k(X_pca: np.ndarray) -> tuple[int, dict[int, float], dict[int, KMeans]]:
    """Entrena K-means para cada k candidato y selecciona el de mayor silueta."""
    siluetas: dict[int, float] = {}
    modelos: dict[int, KMeans] = {}
    for k in K_CANDIDATOS:
        km = KMeans(n_clusters=k, random_state=RANDOM_STATE, n_init=10)
        labels = km.fit_predict(X_pca)
        sil = float(silhouette_score(X_pca, labels))
        siluetas[k] = sil
        modelos[k] = km
        logger.info("segmentacion.kmeans", k=k, silueta=round(sil, 4))
    # Mejor silueta absoluta; ante cuasi-empates (dentro de TOL_SILUETA relativo)
    # elegimos el k más pequeño para evitar clusters degenerados.
    sil_max = max(siluetas.values())
    umbral = sil_max * (1 - TOL_SILUETA)
    mejor_k = min(k for k, s in siluetas.items() if s >= umbral)
    return mejor_k, siluetas, modelos


def _zona_int(zona_id: Any) -> int | None:
    """Convierte un zona_id a int, devolviendo None para NULL/NaN."""
    if zona_id is None:
        return None
    try:
        if isinstance(zona_id, float) and np.isnan(zona_id):
            return None
    except TypeError:
        pass
    if pd.isna(zona_id):
        return None
    return int(zona_id)


def _zonas_adyacentes(zona_id: Any) -> set[int] | None:
    """Conjunto de zonas {z-1, z, z+1}; None si el inmueble no tiene zona."""
    z = _zona_int(zona_id)
    if z is None:
        return None
    return {z - 1, z, z + 1}


def _construir_comparables(df: pd.DataFrame, X_pca: np.ndarray) -> pd.DataFrame:
    """Para cada inmueble selecciona los N comparables más cercanos en PCA,
    respetando los filtros de tipo/zona/segmento. Devuelve un DataFrame con las
    filas a insertar en `comparable` y, de paso, calcula la posición del propio
    inmueble respecto a la mediana de precio_m2 de sus comparables."""
    n = len(df)
    dist_matrix = euclidean_distances(X_pca)
    idx = df.reset_index(drop=True)
    tipo = idx["tipo"].to_numpy()
    zona = idx["zona_id"].to_numpy(dtype=object)
    segmento = idx["segmento"].to_numpy()
    precio_m2 = idx["precio_m2"].to_numpy()
    ids = idx["id"].to_numpy()

    filas_comp: list[dict[str, Any]] = []
    posicion_inmueble: dict[int, str] = {}

    for i in range(n):
        mismo_tipo = (tipo == tipo[i]) & (np.arange(n) != i)

        # Nivel 1: misma zona o adyacente (±1).
        zonas_ok = _zonas_adyacentes(zona[i])
        if zonas_ok is not None:
            en_zona = np.array(
                [_zona_int(z) in zonas_ok if _zona_int(z) is not None else False
                 for z in zona]
            )
            cand = mismo_tipo & en_zona
        else:
            cand = mismo_tipo.copy()

        # Nivel 2: si hay menos de N, ampliar a todas las zonas del mismo segmento.
        if cand.sum() < N_COMPARABLES:
            cand = mismo_tipo & (segmento == segmento[i])
        # Nivel 3: si aún hay menos, usar todo el tipo.
        if cand.sum() < N_COMPARABLES:
            cand = mismo_tipo

        cand_idx = np.where(cand)[0]
        if cand_idx.size == 0:
            continue

        orden = cand_idx[np.argsort(dist_matrix[i, cand_idx])]
        vecinos = orden[:N_COMPARABLES]

        pm2_comps = precio_m2[vecinos]
        mediana_comps = float(np.median(pm2_comps))

        for j in vecinos:
            filas_comp.append(
                {
                    "inmueble_id": int(ids[i]),
                    "comparable_id": int(ids[j]),
                    "distancia_pca": float(round(dist_matrix[i, j], 6)),
                    "dif_precio_m2": float(round(precio_m2[i] - precio_m2[j], 2)),
                    "posicion_vs_mediana": (
                        "encima" if precio_m2[j] > mediana_comps else "debajo"
                    ),
                }
            )

        posicion_inmueble[int(ids[i])] = (
            "debajo" if precio_m2[i] < mediana_comps else "encima"
        )

    comp_df = pd.DataFrame(filas_comp)
    comp_df.attrs["posicion_inmueble"] = posicion_inmueble
    return comp_df


def _persistir_segmentos(df: pd.DataFrame) -> int:
    """Guarda el segmento asignado a cada inmueble en analisis_inmueble."""
    filas = [
        {"id": int(r.id), "seg": int(r.segmento)} for r in df.itertuples()
    ]
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE analisis_inmueble SET segmento = :seg, updated_at = now() "
                "WHERE inmueble_id = :id"
            ),
            filas,
        )
    return len(filas)


def _persistir_comparables(
    comp_df: pd.DataFrame, posicion_inmueble: dict[int, str]
) -> int:
    """Reemplaza la tabla comparable y actualiza analisis_inmueble.posicion_vs_mediana."""
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM comparable"))
        if not comp_df.empty:
            conn.execute(
                text(
                    "INSERT INTO comparable "
                    "(inmueble_id, comparable_id, distancia, distancia_pca, "
                    " dif_precio_m2, posicion_vs_mediana) "
                    "VALUES (:inmueble_id, :comparable_id, :distancia_pca, "
                    " :distancia_pca, :dif_precio_m2, :posicion_vs_mediana)"
                ),
                comp_df.to_dict("records"),
            )
        if posicion_inmueble:
            conn.execute(
                text(
                    "UPDATE analisis_inmueble SET posicion_vs_mediana = :pos, "
                    "updated_at = now() WHERE inmueble_id = :id"
                ),
                [
                    {"id": iid, "pos": pos}
                    for iid, pos in posicion_inmueble.items()
                ],
            )
    return len(comp_df)


def segmentar() -> dict[str, Any]:
    """Ejecuta el pipeline completo: PCA + K-means + comparables, persiste y
    serializa. Devuelve un resumen."""
    df = cargar_datos()
    df = preparar_features(df)

    X = df[FEATURES].to_numpy(dtype=float)
    scaler = StandardScaler().fit(X)
    X_scaled = scaler.transform(X)

    pca = PCA(n_components=N_COMPONENTS, random_state=RANDOM_STATE).fit(X_scaled)
    X_pca = pca.transform(X_scaled)
    logger.info(
        "segmentacion.pca",
        n_components=N_COMPONENTS,
        varianza_explicada=round(float(pca.explained_variance_ratio_.sum()), 4),
    )

    mejor_k, siluetas, modelos = _seleccionar_k(X_pca)
    kmeans = modelos[mejor_k]
    df["segmento"] = kmeans.labels_.astype(int)
    silueta = siluetas[mejor_k]
    logger.info("segmentacion.k_elegido", k=mejor_k, silueta=round(silueta, 4))

    # Serialización de los 3 artefactos.
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(scaler, SCALER_PATH)
    joblib.dump(pca, PCA_PATH)
    joblib.dump(kmeans, KMEANS_PATH)

    # Persistir segmentos antes de construir comparables (los usa el nivel 2).
    _persistir_segmentos(df)

    comp_df = _construir_comparables(df, X_pca)
    posicion_inmueble = comp_df.attrs.get("posicion_inmueble", {})
    comparables_insertados = _persistir_comparables(comp_df, posicion_inmueble)

    conteo = {int(k): int(v) for k, v in df["segmento"].value_counts().items()}
    resultado = ResultadoSegmentacion(
        k=mejor_k,
        silueta=silueta,
        n_inmuebles=int(len(df)),
        conteo_por_segmento=conteo,
        siluetas_por_k={int(k): round(v, 4) for k, v in siluetas.items()},
        comparables_insertados=comparables_insertados,
    )

    resumen = {
        "k": resultado.k,
        "silueta": resultado.silueta,
        "n_inmuebles": resultado.n_inmuebles,
        "conteo_por_segmento": resultado.conteo_por_segmento,
        "siluetas_por_k": resultado.siluetas_por_k,
        "comparables_insertados": resultado.comparables_insertados,
        "varianza_pca": round(float(pca.explained_variance_ratio_.sum()), 4),
        "features": FEATURES,
    }
    RESUMEN_PATH.write_text(json.dumps(resumen, indent=2, ensure_ascii=False))

    logger.info(
        "segmentacion.fin",
        k=mejor_k,
        silueta=round(silueta, 4),
        comparables=comparables_insertados,
        conteo=conteo,
    )
    return resumen


def cargar_resumen() -> dict[str, Any] | None:
    """Devuelve el resumen de la última segmentación, o None si no hay."""
    if not RESUMEN_PATH.exists():
        return None
    return json.loads(RESUMEN_PATH.read_text())


if __name__ == "__main__":
    from app.logging_config import configure_logging

    configure_logging()
    print(json.dumps(segmentar(), indent=2, ensure_ascii=False))
