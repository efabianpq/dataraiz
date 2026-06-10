from __future__ import annotations

from dataclasses import asdict

from fastapi import FastAPI
from pydantic import BaseModel

from app.logging_config import configure_logging
from app.pipelines.geoprocesamiento import run_geoprocesamiento

configure_logging()

app = FastAPI(
    title="DataRaíz Analytics",
    description="Motor analítico de DataRaíz: modelos de valor, scoring y SHAP.",
    version="0.2.0",
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


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
