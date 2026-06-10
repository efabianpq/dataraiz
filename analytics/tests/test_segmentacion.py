"""Tests de integración de Fase 4: segmentación y comparables.

Segmenta una vez (fixture de módulo) y valida los entregables: silueta del
K-means seleccionado > 0.30, segmentos persistidos, comparables suficientes,
coherencia de la tabla comparable y artefactos serializados. Se ejecuta dentro
del contenedor analytics (necesita DB y deps).
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.db import get_engine
from app.main import app
from app.pipelines import segmentacion

client = TestClient(app)


@pytest.fixture(scope="module")
def resultado() -> dict:
    response = client.post("/analytics/segmentar")
    assert response.status_code == 200
    return response.json()


def test_silueta_supera_umbral(resultado):
    assert resultado["silueta"] > 0.30


def test_k_entre_candidatos(resultado):
    assert resultado["k"] in segmentacion.K_CANDIDATOS


def test_endpoint_segmentos(resultado):
    response = client.get("/analytics/segmentos")
    assert response.status_code == 200
    body = response.json()
    assert body["k"] == resultado["k"]
    assert len(body["conteo_por_segmento"]) == resultado["k"]


def test_artefactos_serializados(resultado):
    assert segmentacion.SCALER_PATH.exists()
    assert segmentacion.PCA_PATH.exists()
    assert segmentacion.KMEANS_PATH.exists()


def test_segmentos_persistidos(resultado):
    with get_engine().connect() as conn:
        distintos = conn.execute(
            text(
                "SELECT count(DISTINCT segmento) FROM analisis_inmueble "
                "WHERE segmento IS NOT NULL"
            )
        ).scalar_one()
    assert distintos == resultado["k"]


def test_comparables_suficientes(resultado):
    with get_engine().connect() as conn:
        total = conn.execute(
            text("SELECT count(*) FROM comparable")
        ).scalar_one()
        inmuebles = conn.execute(
            text("SELECT count(DISTINCT inmueble_id) FROM comparable")
        ).scalar_one()
    # Entregable: al menos 3 comparables promedio por inmueble.
    assert total >= inmuebles * 3


def test_comparable_coherente(resultado):
    """Cada fila enlaza inmuebles distintos del mismo tipo, con distancia_pca
    no negativa y posición válida."""
    with get_engine().connect() as conn:
        filas = conn.execute(
            text(
                "SELECT c.inmueble_id, c.comparable_id, c.distancia_pca, "
                "       c.posicion_vs_mediana, i1.tipo AS t1, i2.tipo AS t2 "
                "FROM comparable c "
                "JOIN inmueble i1 ON i1.id = c.inmueble_id "
                "JOIN inmueble i2 ON i2.id = c.comparable_id "
                "LIMIT 50"
            )
        ).mappings().all()
    assert filas
    for f in filas:
        assert f["inmueble_id"] != f["comparable_id"]
        assert f["t1"] == f["t2"]
        assert f["distancia_pca"] >= 0
        assert f["posicion_vs_mediana"] in ("encima", "debajo")
