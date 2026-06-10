"""Test de integración de Fase 2: el endpoint /analytics/geoprocesar corre el
pipeline contra la DB con datos cargados y deja analisis_inmueble poblado.

Requiere DATABASE_URL accesible (se ejecuta dentro del contenedor analytics).
"""

from fastapi.testclient import TestClient
from sqlalchemy import text

from app.db import get_engine
from app.main import app

client = TestClient(app)


def test_geoprocesar_endpoint_sin_errores():
    response = client.post("/analytics/geoprocesar")
    assert response.status_code == 200
    body = response.json()

    # No debe haber lotes con error y todo inmueble con geom queda procesado.
    assert body["errores"] == 0
    assert body["procesados"] == body["inmuebles_con_geom"]
    assert body["actualizados"] == body["inmuebles_con_geom"]


def test_criterios_exito_fase2():
    # Asegura que el pipeline corrió al menos una vez.
    client.post("/analytics/geoprocesar")

    with get_engine().connect() as conn:
        con_geom = conn.execute(
            text("SELECT count(*) FROM inmueble WHERE geom IS NOT NULL")
        ).scalar_one()
        con_dist = conn.execute(
            text("SELECT count(*) FROM analisis_inmueble WHERE dist_pot_m IS NOT NULL")
        ).scalar_one()
        avg_dist = conn.execute(
            text("SELECT avg(dist_pot_m) FROM analisis_inmueble")
        ).scalar_one()
        en_riesgo = conn.execute(
            text("SELECT count(*) FROM analisis_inmueble WHERE en_zona_riesgo = true")
        ).scalar_one()

    # ≥ 90% de los inmuebles con geom tienen dist_pot_m calculada.
    assert con_dist >= 0.90 * con_geom
    # Distancia media al POT razonable en área urbana.
    assert avg_dist is not None and float(avg_dist) < 5000
    # Al menos un inmueble en zona de riesgo.
    assert en_riesgo > 0
