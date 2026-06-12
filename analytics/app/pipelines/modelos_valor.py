"""Fase 3 — Modelos de valor de mercado.

Pipeline de estimación de valor (precio en COP) por inmueble:

1. Carga inmueble + variables espaciales (analisis_inmueble).
2. Limpieza: calcula precio_m2, filtra outliers por tipo (percentil 99 de
   precio y ±3σ de precio_m2), imputa numéricos faltantes con la mediana por
   tipo. `precio_m2` se usa SOLO para filtrar outliers, NO como feature
   (evita fuga de datos hacia el target `precio`).
3. Entrena 4 modelos (split 80/20, random_state=42): LinearRegression,
   DecisionTree(max_depth=8), RandomForest(100) y XGBoost. RF y XGB se
   afinan con RandomizedSearchCV(n_iter=20, cv=5).
4. Selecciona el mejor por RMSE en test; serializa modelo + preprocesador.
5. Predice valor_estimado y brecha para todos los inmuebles con features
   completos y los persiste en analisis_inmueble.

Uso como script:
    python3.11 -m app.pipelines.modelos_valor
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
from sklearn.compose import TransformedTargetRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression
from sklearn.metrics import (
    mean_absolute_error,
    r2_score,
    root_mean_squared_error,
)
from sklearn.base import clone
from sklearn.model_selection import (
    KFold,
    RandomizedSearchCV,
    cross_val_score,
    train_test_split,
)
from sklearn.tree import DecisionTreeRegressor
from sqlalchemy import text
from xgboost import XGBRegressor

from app.db import get_engine

logger = structlog.get_logger(__name__)

# --- Configuración de features / target ---
FEATURES: list[str] = [
    "area_m2",
    "habitaciones",
    "banos",
    "tipo_encoded",
    "dist_pot_m",
    "dist_centrocentro_m",
    "nivel_riesgo_encoded",
]
TARGET = "precio"

TIPO_MAP = {"apto": 0, "casa": 1, "lote": 2, "local": 3}
NIVEL_MAP = {"bajo": 0, "medio": 1, "alto": 2}

RANDOM_STATE = 42
TEST_SIZE = 0.20
CV_FOLDS = 5
N_ITER = 20

MODELS_DIR = Path(__file__).resolve().parents[1] / "models"
MODELO_PATH = MODELS_DIR / "best_model.joblib"
PREPROC_PATH = MODELS_DIR / "preprocessor.joblib"
METRICAS_PATH = MODELS_DIR / "metricas.json"

RF_PARAM_DIST: dict[str, list[Any]] = {
    "n_estimators": [100, 200, 300, 400, 500],
    "max_depth": [None, 5, 10, 15, 20, 30],
    "min_samples_split": [2, 5, 10],
    "min_samples_leaf": [1, 2, 4],
    "max_features": ["sqrt", "log2", 1.0],
}
XGB_PARAM_DIST: dict[str, list[Any]] = {
    "n_estimators": [100, 200, 300, 500],
    "max_depth": [3, 4, 5, 6, 8],
    "learning_rate": [0.01, 0.03, 0.05, 0.1, 0.2],
    "subsample": [0.6, 0.8, 1.0],
    "colsample_bytree": [0.6, 0.8, 1.0],
    "min_child_weight": [1, 3, 5],
}

CARGA_SQL = text(
    """
    SELECT
        i.id,
        i.tipo,
        i.precio,
        i.area_m2,
        i.habitaciones,
        i.banos,
        a.dist_pot_m,
        a.dist_centrocentro_m,
        a.nivel_riesgo
    FROM inmueble i
    JOIN analisis_inmueble a ON a.inmueble_id = i.id
    WHERE i.precio IS NOT NULL AND i.area_m2 IS NOT NULL AND i.area_m2 > 0
    """
)


@dataclass
class MetricasModelo:
    rmse: float
    mae: float
    r2: float


def cargar_datos() -> pd.DataFrame:
    engine = get_engine()
    with engine.connect() as conn:
        df = pd.read_sql(CARGA_SQL, conn)
    return df


def preparar_features(df: pd.DataFrame) -> pd.DataFrame:
    """Calcula precio_m2, encodea categóricas e imputa numéricos con la
    mediana por tipo. No modifica el target."""
    df = df.copy()
    df["precio_m2"] = df["precio"] / df["area_m2"]
    df["tipo_encoded"] = df["tipo"].map(TIPO_MAP)
    # nivel_riesgo NULL ⇒ sin riesgo ⇒ 0 (bajo/none)
    df["nivel_riesgo_encoded"] = df["nivel_riesgo"].map(NIVEL_MAP).fillna(0)

    # Imputación de numéricos con mediana por tipo (red de seguridad; los datos
    # del piloto están completos).
    num_cols = ["habitaciones", "banos", "dist_pot_m", "dist_centrocentro_m"]
    for col in num_cols:
        df[col] = df.groupby("tipo")[col].transform(
            lambda s: s.fillna(s.median())
        )
    return df


IQR_K = 1.5


def _iqr_bounds(serie: pd.Series, k: float = IQR_K) -> tuple[float, float]:
    """Cota [Q1 - k·IQR, Q3 + k·IQR] (regla de Tukey)."""
    q1, q3 = serie.quantile(0.25), serie.quantile(0.75)
    iqr = q3 - q1
    return q1 - k * iqr, q3 + k * iqr


def filtrar_outliers(df: pd.DataFrame) -> pd.DataFrame:
    """Elimina outliers por tipo con la regla de Tukey (IQR) sobre `precio` y
    `precio_m2`.

    La regla [Q1 - 1.5·IQR, Q3 + 1.5·IQR] es robusta ante valores absurdos del
    scraping (p. ej. 515 COP/m² por área en unidad errónea, o 2.9B COP/m²) que
    corrompen la media y la σ del criterio anterior (p1/p99 + 3σ). El recorte
    por cuartiles no se ve arrastrado por la cola, así que al crecer el dataset
    con datos ruidosos mantiene un modelo estable: en el piloto subió la R²
    validada por CV de ~0.51 a ~0.64 y redujo su varianza entre folds a la
    mitad (σ 0.084 → 0.035)."""
    partes: list[pd.DataFrame] = []
    for _tipo, grupo in df.groupby("tipo"):
        pm2_lo, pm2_hi = _iqr_bounds(grupo["precio_m2"])
        precio_lo, precio_hi = _iqr_bounds(grupo["precio"])
        filtro = grupo["precio_m2"].between(pm2_lo, pm2_hi) & grupo[
            "precio"
        ].between(precio_lo, precio_hi)
        partes.append(grupo[filtro])
    limpio = pd.concat(partes, ignore_index=True)
    logger.info(
        "modelos_valor.outliers",
        antes=len(df),
        despues=len(limpio),
        eliminados=len(df) - len(limpio),
    )
    return limpio


def _ttr(estimator) -> TransformedTargetRegressor:
    """Envuelve un estimador para modelar log(1+precio) y devolver COP.

    El precio se distribuye en >3 órdenes de magnitud (17M–30B COP); modelar
    en espacio logarítmico evita que los inmuebles caros dominen el ajuste.
    Las métricas se calculan sobre el precio en COP (predict ya retrocede el
    log internamente)."""
    return TransformedTargetRegressor(
        regressor=estimator, func=np.log1p, inverse_func=np.expm1
    )


def _evaluar(modelo, X_test, y_test) -> MetricasModelo:
    pred = modelo.predict(X_test)
    return MetricasModelo(
        rmse=float(root_mean_squared_error(y_test, pred)),
        mae=float(mean_absolute_error(y_test, pred)),
        r2=float(r2_score(y_test, pred)),
    )


def entrenar() -> dict[str, Any]:
    """Entrena los 4 modelos, selecciona el mejor por RMSE, serializa y
    persiste predicciones. Devuelve un resumen de métricas."""
    df = cargar_datos()
    df = preparar_features(df)
    df_limpio = filtrar_outliers(df)

    X = df_limpio[FEATURES]
    y = df_limpio[TARGET].astype(float)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=TEST_SIZE, random_state=RANDOM_STATE
    )

    # Preprocesador: imputación por mediana (red de seguridad en predicción).
    preprocessor = SimpleImputer(strategy="median").fit(X_train)
    X_train_p = preprocessor.transform(X_train)
    X_test_p = preprocessor.transform(X_test)

    logger.info(
        "modelos_valor.split",
        n_train=int(len(X_train)),
        n_test=int(len(X_test)),
        features=FEATURES,
    )

    modelos: dict[str, Any] = {}
    modelos["LinearRegression"] = _ttr(LinearRegression()).fit(X_train_p, y_train)
    modelos["DecisionTree"] = _ttr(
        DecisionTreeRegressor(max_depth=8, random_state=RANDOM_STATE)
    ).fit(X_train_p, y_train)

    # En las búsquedas, los hiperparámetros del estimador interno se prefijan
    # con "regressor__" porque va envuelto en TransformedTargetRegressor.
    # Reproducibilidad total: tanto los ESTIMADORES (n_jobs=1; XGBoost además
    # tree_method="exact") como las BÚSQUEDAS (n_jobs=1) se ejecutan en serie.
    # Con multihilo el ajuste de XGBoost variaba a nivel de punto flotante y,
    # sobre el test pequeño (n≈58), oscilaba el R² (~0.48-0.55) e incluso el
    # modelo seleccionado; serializar elimina esa varianza por orden de ejecución
    # (el costo extra es de pocos segundos para n_iter=20, cv=5).
    rf_search = RandomizedSearchCV(
        _ttr(RandomForestRegressor(random_state=RANDOM_STATE, n_jobs=1)),
        {f"regressor__{k}": v for k, v in RF_PARAM_DIST.items()},
        n_iter=N_ITER,
        cv=CV_FOLDS,
        scoring="neg_root_mean_squared_error",
        random_state=RANDOM_STATE,
        n_jobs=1,
    ).fit(X_train_p, y_train)
    modelos["RandomForest"] = rf_search.best_estimator_

    xgb_search = RandomizedSearchCV(
        _ttr(
            XGBRegressor(
                random_state=RANDOM_STATE,
                n_jobs=1,
                tree_method="exact",
                objective="reg:squarederror",
            )
        ),
        {f"regressor__{k}": v for k, v in XGB_PARAM_DIST.items()},
        n_iter=N_ITER,
        cv=CV_FOLDS,
        scoring="neg_root_mean_squared_error",
        random_state=RANDOM_STATE,
        n_jobs=1,
    ).fit(X_train_p, y_train)
    modelos["XGBoost"] = xgb_search.best_estimator_

    metricas_por_modelo: dict[str, MetricasModelo] = {
        nombre: _evaluar(modelo, X_test_p, y_test)
        for nombre, modelo in modelos.items()
    }
    for nombre, m in metricas_por_modelo.items():
        logger.info(
            "modelos_valor.eval",
            modelo=nombre,
            rmse=round(m.rmse, 2),
            mae=round(m.mae, 2),
            r2=round(m.r2, 4),
        )

    mejor_nombre = min(
        metricas_por_modelo, key=lambda n: metricas_por_modelo[n].rmse
    )
    mejor_modelo = modelos[mejor_nombre]
    mejor_metricas = metricas_por_modelo[mejor_nombre]

    # R² validada por CV (5-fold) sobre todo el set limpio: métrica estable que
    # promedia el ruido del split único (que oscila ~0.49-0.59 sobre n≈135).
    # Es la cifra de referencia para el umbral de calidad y para el seguimiento
    # al crecer el dataset vía scraping.
    X_full = preprocessor.transform(X)
    cv_scores = cross_val_score(
        clone(mejor_modelo),
        X_full,
        y,
        cv=KFold(n_splits=CV_FOLDS, shuffle=True, random_state=RANDOM_STATE),
        scoring="r2",
        n_jobs=1,
    )
    r2_cv = float(cv_scores.mean())
    r2_cv_std = float(cv_scores.std())

    # Serialización.
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(mejor_modelo, MODELO_PATH)
    joblib.dump(preprocessor, PREPROC_PATH)

    resumen = {
        "modelo": mejor_nombre,
        "rmse": mejor_metricas.rmse,
        "mae": mejor_metricas.mae,
        "r2": mejor_metricas.r2,
        "r2_cv": r2_cv,
        "r2_cv_std": r2_cv_std,
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
        "modelos": {
            n: {"rmse": m.rmse, "mae": m.mae, "r2": m.r2}
            for n, m in metricas_por_modelo.items()
        },
    }
    METRICAS_PATH.write_text(json.dumps(resumen, indent=2, ensure_ascii=False))

    # Predicción + persistencia para TODOS los inmuebles con features completos
    # (incluye los atípicos: su brecha alta los marca como sobrevalorados).
    actualizados = predecir_y_persistir(mejor_modelo, preprocessor, df)
    resumen["inmuebles_actualizados"] = actualizados

    logger.info(
        "modelos_valor.fin",
        modelo=mejor_nombre,
        rmse=round(mejor_metricas.rmse, 2),
        r2=round(mejor_metricas.r2, 4),
        r2_cv=round(r2_cv, 4),
        r2_cv_std=round(r2_cv_std, 4),
        inmuebles_actualizados=actualizados,
    )
    return resumen


def predecir_y_persistir(modelo, preprocessor, df: pd.DataFrame) -> int:
    """Predice valor_estimado y brecha para cada inmueble y los persiste."""
    X = preprocessor.transform(df[FEATURES])
    pred = modelo.predict(X)
    # Piso de seguridad para evitar divisiones por cero / valores negativos.
    valor_estimado = np.maximum(pred, 1.0)
    brecha = (df["precio"].to_numpy() - valor_estimado) / valor_estimado * 100

    filas = [
        {
            "id": int(inmueble_id),
            "ve": float(round(ve, 2)),
            "br": float(round(b, 2)),
        }
        for inmueble_id, ve, b in zip(df["id"], valor_estimado, brecha)
    ]

    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE analisis_inmueble "
                "SET valor_estimado = :ve, brecha = :br, updated_at = now() "
                "WHERE inmueble_id = :id"
            ),
            filas,
        )
    return len(filas)


def cargar_metricas() -> dict[str, Any] | None:
    """Devuelve las métricas del modelo activo, o None si no hay modelo."""
    if not METRICAS_PATH.exists():
        return None
    return json.loads(METRICAS_PATH.read_text())


if __name__ == "__main__":
    from app.logging_config import configure_logging

    configure_logging()
    print(json.dumps(entrenar(), indent=2, ensure_ascii=False))
