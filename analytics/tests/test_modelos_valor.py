"""Tests de integración de Fase 3: entrenamiento de modelos de valor.

Entrena una vez (fixture de módulo) y valida los entregables: 4 modelos,
endpoint de métricas, R² > 0.60, persistencia de valor_estimado y artefactos
serializados. Se ejecuta dentro del contenedor analytics (necesita DB y deps).
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.db import get_engine
from app.main import app
from app.pipelines import modelos_valor

client = TestClient(app)


@pytest.fixture(scope="module")
def entrenamiento() -> dict:
    response = client.post("/analytics/entrenar")
    assert response.status_code == 200
    return response.json()


def test_entrena_los_cuatro_modelos(entrenamiento):
    modelos = entrenamiento["modelos"]
    assert set(modelos) == {
        "LinearRegression",
        "DecisionTree",
        "RandomForest",
        "XGBoost",
    }
    for metricas in modelos.values():
        assert {"rmse", "mae", "r2"} <= set(metricas)


def test_r2_supera_umbral(entrenamiento):
    assert entrenamiento["r2"] > 0.60


def test_endpoint_metricas(entrenamiento):
    response = client.get("/analytics/metricas")
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"modelo", "rmse", "mae", "r2", "n_train"}
    assert body["modelo"] == entrenamiento["modelo"]


def test_artefactos_serializados(entrenamiento):
    assert modelos_valor.MODELO_PATH.exists()
    assert modelos_valor.PREPROC_PATH.exists()


def test_valor_estimado_persistido(entrenamiento):
    with get_engine().connect() as conn:
        con_valor = conn.execute(
            text(
                "SELECT count(*) FROM analisis_inmueble "
                "WHERE valor_estimado IS NOT NULL"
            )
        ).scalar_one()
        completos = conn.execute(
            text(
                "SELECT count(*) FROM inmueble i "
                "JOIN analisis_inmueble a ON a.inmueble_id = i.id "
                "WHERE i.precio IS NOT NULL AND i.area_m2 > 0"
            )
        ).scalar_one()
    assert con_valor == completos
