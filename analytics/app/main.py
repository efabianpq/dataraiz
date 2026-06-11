from __future__ import annotations

from dataclasses import asdict
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from app.logging_config import configure_logging
from app.pipelines import modelos_valor, oportunidad_finanzas, scoring, segmentacion
from app.pipelines.geoprocesamiento import run_geoprocesamiento

configure_logging()

app = FastAPI(
    title="DataRaíz Analytics",
    description="Motor analítico de DataRaíz: modelos de valor, scoring y SHAP.",
    version="0.4.0",
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# ============================================================
# Fase 2 — Geoprocesamiento
# ============================================================
class GeoprocesarRequest(BaseModel):
    """Cuerpo opcional: si se omite, se geoprocesan todos los inmuebles con geom."""

    inmueble_ids: list[int] | None = None


class GeoprocesarResponse(BaseModel):
    inmuebles_con_geom: int
    procesados: int
    actualizados: int
    lotes: int
    errores: int


@app.post("/analytics/geoprocesar", response_model=GeoprocesarResponse)
def geoprocesar(req: GeoprocesarRequest | None = None) -> GeoprocesarResponse:
    """Dispara el recálculo de variables de contexto espacial por inmueble."""
    inmueble_ids = req.inmueble_ids if req is not None else None
    resultado = run_geoprocesamiento(inmueble_ids)
    return GeoprocesarResponse(**asdict(resultado))


# ============================================================
# Fase 3 — Modelos de valor de mercado
# ============================================================
class MetricasResponse(BaseModel):
    modelo: str
    rmse: float
    mae: float
    r2: float
    n_train: int


@app.post("/analytics/entrenar")
def entrenar() -> dict[str, Any]:
    """Re-entrena los modelos de valor y devuelve las métricas resultantes."""
    return modelos_valor.entrenar()


@app.get("/analytics/metricas", response_model=MetricasResponse)
def metricas() -> MetricasResponse:
    """Devuelve las métricas del modelo de valor activo."""
    datos = modelos_valor.cargar_metricas()
    if datos is None:
        raise HTTPException(
            status_code=404,
            detail="No hay modelo entrenado todavía. Ejecute POST /analytics/entrenar.",
        )
    return MetricasResponse(
        modelo=datos["modelo"],
        rmse=datos["rmse"],
        mae=datos["mae"],
        r2=datos["r2"],
        n_train=datos["n_train"],
    )


# ============================================================
# Fase 4 — Segmentación y comparables
# ============================================================
class SegmentosResponse(BaseModel):
    k: int
    silueta: float
    n_inmuebles: int
    conteo_por_segmento: dict[int, int]
    siluetas_por_k: dict[int, float]
    comparables_insertados: int


@app.post("/analytics/segmentar")
def segmentar() -> dict[str, Any]:
    """Recalcula segmentos (PCA + K-means) y comparables completos."""
    return segmentacion.segmentar()


@app.get("/analytics/segmentos", response_model=SegmentosResponse)
def segmentos() -> SegmentosResponse:
    """Devuelve el resumen de la última segmentación: k, silueta y conteos."""
    datos = segmentacion.cargar_resumen()
    if datos is None:
        raise HTTPException(
            status_code=404,
            detail="No hay segmentación todavía. Ejecute POST /analytics/segmentar.",
        )
    return SegmentosResponse(
        k=datos["k"],
        silueta=datos["silueta"],
        n_inmuebles=datos["n_inmuebles"],
        conteo_por_segmento=datos["conteo_por_segmento"],
        siluetas_por_k=datos["siluetas_por_k"],
        comparables_insertados=datos["comparables_insertados"],
    )


# ============================================================
# Fase 5 — Oportunidad y finanzas
# ============================================================
@app.post("/analytics/clasificar")
def clasificar() -> dict[str, Any]:
    """Reentrena el clasificador de oportunidad y recalcula prob_oportunidad."""
    return oportunidad_finanzas.clasificar()


@app.post("/analytics/financiero")
def financiero() -> dict[str, Any]:
    """Recalcula canon_estimado_mensual, yield_bruto y cap_rate por inmueble."""
    return oportunidad_finanzas.calcular_financiero()


# ============================================================
# Fase 6 — Score integrado, SHAP y optimización
# ============================================================
@app.post("/analytics/calcular_score")
def calcular_score() -> dict[str, Any]:
    """Calcula el score (0-100) de los inmuebles con datos completos."""
    return scoring.calcular_score()


@app.post("/analytics/calcular_shap")
def calcular_shap() -> dict[str, Any]:
    """Calcula los valores SHAP del modelo de valor para cada inmueble."""
    return scoring.calcular_shap()


@app.get("/analytics/score/{inmueble_id}/explicacion")
def explicacion(inmueble_id: int) -> dict[str, Any]:
    """Devuelve score, prob_oportunidad, brecha, yield_bruto y shap_json."""
    datos = scoring.cargar_explicacion(inmueble_id)
    if datos is None:
        raise HTTPException(
            status_code=404,
            detail=f"No hay análisis para el inmueble {inmueble_id}.",
        )
    return datos


class OptimizarRequest(BaseModel):
    """Criterios del inversionista para el frente de Pareto. Todos opcionales:
    omitirlos equivale a no filtrar por ese criterio."""

    presupuesto_max: float | None = None
    zona_ids: list[int] | None = None
    tipos: list[str] | None = None
    tolerancia_riesgo: str = "alto"


@app.post("/analytics/optimizar")
def optimizar(req: OptimizarRequest | None = None) -> dict[str, Any]:
    """Frente de Pareto (NSGA-II) sobre los inmuebles que cumplen los criterios."""
    req = req or OptimizarRequest()
    return scoring.optimizar(
        presupuesto_max=req.presupuesto_max,
        zona_ids=req.zona_ids,
        tipos=req.tipos,
        tolerancia_riesgo=req.tolerancia_riesgo,
    )
