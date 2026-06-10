"""Fase 2 — Geoprocesamiento.

Calcula las variables de contexto espacial de cada inmueble con geometría y
las persiste (idempotentemente) en analisis_inmueble. Todo el cálculo se
delega a PostGIS (ST_Transform a SRID 9377 para distancias en metros, KNN con
el operador `<->`, point-in-polygon e intersección), orquestado en Python con
SQLAlchemy y procesado en lotes para no agotar memoria.

Variables calculadas:
- dist_pot_m: distancia en metros al proyecto POT más cercano (cualquiera de
  los tipos: uso_suelo, via_proyectada, tratamiento_urbanistico).
- en_zona_riesgo: True si el inmueble intersecta algún polígono de capa_riesgo.
- nivel_riesgo: nivel del polígono de riesgo más severo que lo intersecta
  ('bajo'/'medio'/'alto'), o NULL si no intersecta ninguno.
- dist_centrocentro_m: distancia en metros al centro de Bucaramanga
  (Plaza de los Búcaros, CENTRO_LAT/CENTRO_LNG).
- zona_id: zona (municipio) que contiene al inmueble; ante solape de bounding
  boxes se elige la de menor área (la más específica).

Uso como script:
    python3.11 -m app.pipelines.geoprocesamiento
"""

from __future__ import annotations

import os
from dataclasses import asdict, dataclass
from typing import Iterator, Sequence

import structlog
from sqlalchemy import text

from app.db import get_engine

logger = structlog.get_logger(__name__)

CENTRO_LAT = float(os.environ.get("CENTRO_LAT", "7.1197"))
CENTRO_LNG = float(os.environ.get("CENTRO_LNG", "-73.1227"))
SRID_COLOMBIA = int(os.environ.get("SRID_COLOMBIA", "9377"))
BATCH_SIZE = 100
# Nº de candidatos más cercanos (en grados 4326, vía índice GIST) que se
# refinan con distancia métrica real en SRID 9377 para hallar el verdadero
# vecino más cercano en metros.
KNN_CANDIDATOS = 5

UPSERT_SQL = text(
    f"""
    INSERT INTO analisis_inmueble (
        inmueble_id, dist_pot_m, en_zona_riesgo, nivel_riesgo,
        dist_centrocentro_m, zona_id, updated_at
    )
    SELECT
        i.id,
        pot.dist_pot_m,
        (riesgo.nivel_riesgo IS NOT NULL)                AS en_zona_riesgo,
        riesgo.nivel_riesgo,
        ST_Distance(
            ST_Transform(i.geom, :srid),
            ST_Transform(ST_SetSRID(ST_MakePoint(:lng, :lat), 4326), :srid)
        )                                                AS dist_centrocentro_m,
        zna.zona_id,
        now()
    FROM inmueble i
    LEFT JOIN LATERAL (
        SELECT MIN(
            ST_Distance(ST_Transform(i.geom, :srid), ST_Transform(c.geom, :srid))
        ) AS dist_pot_m
        FROM (
            SELECT p.geom
            FROM proyecto_pot p
            ORDER BY i.geom <-> p.geom
            LIMIT {KNN_CANDIDATOS}
        ) c
    ) pot ON true
    LEFT JOIN LATERAL (
        SELECT r.nivel AS nivel_riesgo
        FROM capa_riesgo r
        WHERE ST_Intersects(i.geom, r.geom)
        ORDER BY CASE r.nivel
            WHEN 'alto' THEN 3 WHEN 'medio' THEN 2 WHEN 'bajo' THEN 1 ELSE 0
        END DESC
        LIMIT 1
    ) riesgo ON true
    LEFT JOIN LATERAL (
        SELECT z.id AS zona_id
        FROM zona z
        WHERE ST_Contains(z.geom, i.geom)
        ORDER BY ST_Area(z.geom) ASC
        LIMIT 1
    ) zna ON true
    WHERE i.id = ANY(:ids) AND i.geom IS NOT NULL
    ON CONFLICT (inmueble_id) DO UPDATE SET
        dist_pot_m          = EXCLUDED.dist_pot_m,
        en_zona_riesgo      = EXCLUDED.en_zona_riesgo,
        nivel_riesgo        = EXCLUDED.nivel_riesgo,
        dist_centrocentro_m = EXCLUDED.dist_centrocentro_m,
        zona_id             = EXCLUDED.zona_id,
        updated_at          = now()
    RETURNING inmueble_id
    """
)


@dataclass
class GeoprocesarResult:
    inmuebles_con_geom: int
    procesados: int
    actualizados: int
    lotes: int
    errores: int


def _chunks(seq: list[int], size: int) -> Iterator[list[int]]:
    for start in range(0, len(seq), size):
        yield seq[start : start + size]


def run_geoprocesamiento(
    inmueble_ids: Sequence[int] | None = None,
) -> GeoprocesarResult:
    """Recalcula las variables espaciales y las persiste en analisis_inmueble.

    Si `inmueble_ids` es None procesa todos los inmuebles con geom; si se
    pasa una lista, se restringe a esos (filtrando los que tengan geom).
    Es idempotente: usa UPSERT por inmueble_id.
    """
    engine = get_engine()
    actualizados = 0
    procesados = 0
    errores = 0

    # Lectura de IDs en una conexión de corta vida (se cierra antes del bucle).
    with engine.connect() as conn:
        if inmueble_ids is None:
            rows = conn.execute(
                text(
                    "SELECT id FROM inmueble WHERE geom IS NOT NULL ORDER BY id"
                )
            ).all()
        else:
            rows = conn.execute(
                text(
                    "SELECT id FROM inmueble "
                    "WHERE geom IS NOT NULL AND id = ANY(:ids) ORDER BY id"
                ),
                {"ids": list(inmueble_ids)},
            ).all()
    ids = [r[0] for r in rows]
    total = len(ids)
    lotes = (total + BATCH_SIZE - 1) // BATCH_SIZE

    logger.info(
        "geoprocesamiento.inicio",
        inmuebles_con_geom=total,
        lotes=lotes,
        batch_size=BATCH_SIZE,
        srid=SRID_COLOMBIA,
    )

    # Cada lote en su propia transacción (engine.begin commitea al salir).
    for n, batch in enumerate(_chunks(ids, BATCH_SIZE), start=1):
        try:
            with engine.begin() as conn:
                result = conn.execute(
                    UPSERT_SQL,
                    {
                        "ids": batch,
                        "lng": CENTRO_LNG,
                        "lat": CENTRO_LAT,
                        "srid": SRID_COLOMBIA,
                    },
                )
                afectados = len(result.fetchall())
            actualizados += afectados
            procesados += len(batch)
            logger.info(
                "geoprocesamiento.lote_ok",
                lote=n,
                de=lotes,
                inmuebles=len(batch),
                actualizados=afectados,
            )
        except Exception as exc:  # noqa: BLE001 — se registra y continúa
            errores += 1
            logger.error(
                "geoprocesamiento.lote_error",
                lote=n,
                de=lotes,
                error=str(exc),
            )

    logger.info(
        "geoprocesamiento.fin",
        procesados=procesados,
        actualizados=actualizados,
        errores=errores,
    )

    return GeoprocesarResult(
        inmuebles_con_geom=total,
        procesados=procesados,
        actualizados=actualizados,
        lotes=lotes,
        errores=errores,
    )


if __name__ == "__main__":
    from app.logging_config import configure_logging

    configure_logging()
    resultado = run_geoprocesamiento()
    print(asdict(resultado))
