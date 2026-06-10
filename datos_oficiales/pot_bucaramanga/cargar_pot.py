"""Carga capas del POT del Área Metropolitana de Bucaramanga en proyecto_pot.

Fuente: FeatureServer "POT_1G_FloridablancaLayers" (services9.arcgis.com),
único POT del AMB con endpoints REST verificados y descargables. Cubre
principalmente Floridablanca, pero el recorte por bbox se aplica a todo
el AMB por si futuras capas amplían la cobertura.

Uso (dentro del contenedor analytics):
    python3.11 datos_oficiales/pot_bucaramanga/cargar_pot.py
"""

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import psycopg2
from psycopg2.extras import execute_values

from arcgis_utils import fetch_arcgis_features

BASE_URL = (
    "https://services9.arcgis.com/IkF6lsijOjmSrMjJ/arcgis/rest/services/"
    "POT_1G_FloridablancaLayers/FeatureServer"
)

CAPAS = [
    {
        "url": f"{BASE_URL}/14/query",
        "tipo": "tratamiento_urbanistico",
        "estado": "vigente",
        "nombre": lambda a: f"{a.get('DESCRIPCN') or 'Tratamiento urbanístico'} ({a.get('ABRVT') or '-'})",
    },
    {
        "url": f"{BASE_URL}/13/query",
        "tipo": "uso_suelo",
        "estado": "vigente",
        "nombre": lambda a: f"{a.get('DESCRIPCIO') or 'Uso del suelo'} ({a.get('ABRVT') or '-'})",
    },
    {
        "url": f"{BASE_URL}/11/query",
        "tipo": "via_proyectada",
        "estado": "proyectado",
        "nombre": lambda a: (
            f"Vía {a.get('JERARQUIA') or 'sin jerarquía'} "
            f"({(a.get('PERFIL_VIA') or '').strip() or 'sin perfil'})"
        ),
    },
]


def main() -> None:
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor() as cur:
            total = 0
            for capa in CAPAS:
                features = fetch_arcgis_features(capa["url"])
                print(f"[{capa['tipo']}] {len(features)} features descargados")

                cur.execute("DELETE FROM proyecto_pot WHERE tipo = %s", (capa["tipo"],))

                rows = []
                for feat in features:
                    geom = feat.get("geometry")
                    if geom is None:
                        continue
                    nombre = capa["nombre"](feat.get("properties", {}))
                    rows.append((nombre[:150], capa["tipo"], capa["estado"], json.dumps(geom)))

                if rows:
                    execute_values(
                        cur,
                        "INSERT INTO proyecto_pot (nombre, tipo, estado, geom) VALUES %s",
                        rows,
                        template=(
                            "(%s, %s, %s, "
                            "ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)))"
                        ),
                    )
                print(f"[{capa['tipo']}] {len(rows)} insertados en proyecto_pot")
                total += len(rows)

        conn.commit()
        print(f"Total insertado en proyecto_pot: {total}")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
