"""Carga la capa de amenaza por movimiento en masa del POT de Floridablanca
(AMB) en capa_riesgo.

Fuente: FeatureServer "POT_1G_FloridablancaLayers" (services9.arcgis.com),
capa "Amenaza_Mov_Masa" (layer 15), única capa de amenaza del AMB con
endpoint REST verificado y descargable.

Uso (dentro del contenedor analytics):
    python3.11 datos_oficiales/riesgo/cargar_riesgo.py
"""

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import psycopg2
from psycopg2.extras import execute_values

from arcgis_utils import fetch_arcgis_features

URL = (
    "https://services9.arcgis.com/IkF6lsijOjmSrMjJ/arcgis/rest/services/"
    "POT_1G_FloridablancaLayers/FeatureServer/15/query"
)

CATEGORIA = "movimiento_masa"

NIVEL_POR_DESCRIPCION = {
    "amenaza baja": "bajo",
    "amenaza media": "medio",
    "amenaza alta": "alto",
    "amenaza muy alta": "alto",
}

NIVEL_POR_CODIGO = {1: "bajo", 2: "medio", 3: "alto", 4: "alto"}


def nivel_de(attrs: dict) -> str:
    descripcion = (attrs.get("DESCRIPCN") or "").strip().lower()
    if descripcion in NIVEL_POR_DESCRIPCION:
        return NIVEL_POR_DESCRIPCION[descripcion]
    return NIVEL_POR_CODIGO.get(attrs.get("AMENAZA"), "medio")


def main() -> None:
    features = fetch_arcgis_features(URL)
    print(f"[{CATEGORIA}] {len(features)} features descargados")

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM capa_riesgo WHERE categoria = %s", (CATEGORIA,))

            rows = []
            for feat in features:
                geom = feat.get("geometry")
                if geom is None:
                    continue
                attrs = feat.get("properties", {})
                rows.append((CATEGORIA, nivel_de(attrs), json.dumps(geom)))

            if rows:
                execute_values(
                    cur,
                    "INSERT INTO capa_riesgo (categoria, nivel, geom) VALUES %s",
                    rows,
                    template=(
                        "(%s, %s, "
                        "ST_Multi(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326))))"
                    ),
                )
        conn.commit()
        print(f"Total insertado en capa_riesgo: {len(rows)}")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
