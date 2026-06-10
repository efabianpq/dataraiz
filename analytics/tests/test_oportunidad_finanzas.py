"""Tests de integración de Fase 5: clasificador de oportunidad y capa financiera.

Ejecuta ambos pipelines (fixtures de módulo) y valida los entregables: AUC del
clasificador > 0.65, prob_oportunidad persistido para todos los inmuebles con
al menos uno > 0.7, y yield_bruto promedio entre 4% y 10% excluyendo los
segmentos atípicos (2 y 3). Se ejecuta dentro del contenedor analytics
(necesita DB con segmento ya calculado por Fase 4).
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.db import get_engine
from app.main import app
from app.pipelines import oportunidad_finanzas

client = TestClient(app)


@pytest.fixture(scope="module")
def clasificacion() -> dict:
    response = client.post("/analytics/clasificar")
    assert response.status_code == 200
    return response.json()


@pytest.fixture(scope="module")
def financiero() -> dict:
    response = client.post("/analytics/financiero")
    assert response.status_code == 200
    return response.json()


def test_auc_supera_umbral(clasificacion):
    assert clasificacion["auc_cv_mean"] > 0.65


def test_hay_oportunidades_etiquetadas(clasificacion):
    assert clasificacion["n_oportunidades"] > 0


def test_artefacto_clasificador_serializado(clasificacion):
    assert oportunidad_finanzas.CLASIFICADOR_PATH.exists()


def test_prob_oportunidad_persistida(clasificacion):
    with get_engine().connect() as conn:
        con_prob = conn.execute(
            text(
                "SELECT count(*) FROM analisis_inmueble "
                "WHERE prob_oportunidad IS NOT NULL"
            )
        ).scalar_one()
        con_prob_alta = conn.execute(
            text(
                "SELECT count(*) FROM analisis_inmueble WHERE prob_oportunidad > 0.7"
            )
        ).scalar_one()
    assert con_prob == clasificacion["n_inmuebles"]
    assert con_prob_alta > 0


def test_yield_bruto_rango_razonable(financiero):
    with get_engine().connect() as conn:
        avg_yield = conn.execute(
            text(
                "SELECT avg(yield_bruto) FROM analisis_inmueble "
                "WHERE yield_bruto IS NOT NULL"
            )
        ).scalar_one()
    assert 4.0 <= float(avg_yield) <= 10.0


def test_segmentos_outliers_excluidos(financiero):
    with get_engine().connect() as conn:
        filas = conn.execute(
            text(
                "SELECT count(*) FROM analisis_inmueble "
                "WHERE segmento IN (2, 3) AND yield_bruto IS NOT NULL"
            )
        ).scalar_one()
    assert filas == 0


def test_cap_rate_menor_que_yield(financiero):
    with get_engine().connect() as conn:
        filas = conn.execute(
            text(
                "SELECT yield_bruto, cap_rate FROM analisis_inmueble "
                "WHERE yield_bruto IS NOT NULL LIMIT 50"
            )
        ).all()
    assert filas
    for yld, cap in filas:
        assert float(cap) < float(yld)


def test_artefactos_resumen_serializados(clasificacion, financiero):
    assert oportunidad_finanzas.OPORTUNIDAD_RESUMEN_PATH.exists()
    assert oportunidad_finanzas.FINANCIERO_RESUMEN_PATH.exists()
