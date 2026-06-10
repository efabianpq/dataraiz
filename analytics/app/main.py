from __future__ import annotations

from dataclasses import asdict
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from app.logging_config import configure_logging
from app.pipelines import modelos_valor, oportunidad_finanzas, segmentacion
from app.pipelines.geoprocesamiento import run_geoprocesamiento

configure_logging()

app = FastAPI(
    title="DataRaíz Analytics",
    description="Motor analítico de DataRaíz: modelos de valor, scoring y SHAP.",
    version="0.3.0",
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
