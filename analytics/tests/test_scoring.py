"""Tests de integración de Fase 6: score integrado, SHAP y NSGA-II.

Ejecuta los pipelines vía la API (fixtures de módulo) y valida los entregables:
score distribuido en 0-100 persistido para los inmuebles con datos completos,
shap_json poblado con contribuciones ordenadas, endpoint de explicación, y
frente de Pareto con 3-20 inmuebles respondiendo en < 10 s. Se ejecuta dentro
del contenedor analytics (necesita la DB con Fases 3-5 ya calculadas).
"""

import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.db import get_engine
from app.main import app
from app.pipelines import scoring

client = TestClient(app)


@pytest.fixture(scope="module")
def score() -> dict:
    response = client.post("/analytics/calcular_score")
    assert response.status_code == 200
    return response.json()


@pytest.fixture(scope="module")
def shap_resultado() -> dict:
    response = client.post("/analytics/calcular_shap")
    assert response.status_code == 200
    return response.json()


def test_score_distribuido_0_100(score):
    assert 0.0 <= score["score_min"] <= score["score_max"] <= 100.0
    assert score["score_max"] > score["score_min"]


def test_score_persistido_en_db(score):
    with get_engine().connect() as conn:
        fila = conn.execute(
            text(
                "SELECT min(score), max(score), avg(score), count(*) "
                "FROM analisis_inmueble WHERE score IS NOT NULL"
            )
        ).one()
    smin, smax, _savg, count = fila
    assert int(count) == score["n_inmuebles"]
    assert float(smin) >= 0.0 and float(smax) <= 100.0


def test_atipicos_sin_score(score):
    with get_engine().connect() as conn:
        sin_yield_con_score = conn.execute(
            text(
                "SELECT count(*) FROM analisis_inmueble "
                "WHERE yield_bruto IS NULL AND score IS NOT NULL"
            )
        ).scalar_one()
    assert sin_yield_con_score == 0


def test_pesos_configurables(score):
    assert set(score["pesos"]) == {
        "oportunidad",
        "brecha",
        "yield",
        "riesgo",
        "comps",
    }


def test_shap_persistido_y_ordenado(shap_resultado):
    with get_engine().connect() as conn:
        con_shap = conn.execute(
            text(
                "SELECT count(*) FROM analisis_inmueble WHERE shap_json IS NOT NULL"
            )
        ).scalar_one()
    assert con_shap == shap_resultado["n_inmuebles"]


def test_endpoint_explicacion(score, shap_resultado):
    with get_engine().connect() as conn:
        inmueble_id = conn.execute(
            text(
                "SELECT inmueble_id FROM analisis_inmueble "
                "WHERE score IS NOT NULL AND shap_json IS NOT NULL LIMIT 1"
            )
        ).scalar_one()
    response = client.get(f"/analytics/score/{inmueble_id}/explicacion")
    assert response.status_code == 200
    data = response.json()
    assert data["score"] is not None
    contribuciones = data["shap_json"]
    assert isinstance(contribuciones, list) and len(contribuciones) == len(
        scoring.FEATURES_VALOR
    )
    impactos = [abs(c["impact"]) for c in contribuciones]
    assert impactos == sorted(impactos, reverse=True)
    for clave in ("feature", "value", "impact"):
        assert clave in contribuciones[0]


def test_explicacion_inmueble_inexistente():
    response = client.get("/analytics/score/99999999/explicacion")
    assert response.status_code == 404


def test_optimizar_frente_pareto():
    inicio = time.time()
    response = client.post(
        "/analytics/optimizar",
        json={
            "presupuesto_max": 500_000_000,
            "zona_ids": [1, 2, 3, 4],
            "tipos": ["apto", "casa", "lote", "local"],
            "tolerancia_riesgo": "alto",
        },
    )
    elapsed = time.time() - inicio
    assert response.status_code == 200
    data = response.json()
    assert elapsed < 10.0
    assert data["segundos"] < 10.0
    assert 3 <= data["n_frente"] <= 20
    assert len(data["frente"]) == data["n_frente"]
    yields = [f["yield_bruto"] for f in data["frente"]]
    assert yields == sorted(yields, reverse=True)


def test_optimizar_respeta_presupuesto():
    response = client.post(
        "/analytics/optimizar", json={"presupuesto_max": 300_000_000}
    )
    assert response.status_code == 200
    for inmueble in response.json()["frente"]:
        assert inmueble["precio"] <= 300_000_000
