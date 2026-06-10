"""Utilidades compartidas para descargar capas de servicios ArcGIS REST (FeatureServer)."""

import time
from typing import Any

import requests

USER_AGENT = "DataRaiz/1.0 (+https://github.com/efabianpq/dataraiz; contacto: efabianpq@gmail.com)"

# Bounding box aproximado del Área Metropolitana de Bucaramanga (SRID 4326)
AMB_BBOX = "-73.25,6.95,-73.00,7.20"


def fetch_arcgis_features(
    url: str, page_size: int = 1000, bbox: str = AMB_BBOX
) -> list[dict[str, Any]]:
    """Descarga todos los features de un endpoint /query de ArcGIS REST,
    recortados al bbox del AMB y reproyectados a SRID 4326, paginando con
    resultOffset/resultRecordCount."""
    features: list[dict[str, Any]] = []
    offset = 0
    while True:
        params = {
            "where": "1=1",
            "outFields": "*",
            "geometry": bbox,
            "geometryType": "esriGeometryEnvelope",
            "inSR": "4326",
            "spatialRel": "esriSpatialRelIntersects",
            "outSR": "4326",
            "f": "geojson",
            "resultOffset": offset,
            "resultRecordCount": page_size,
        }
        resp = requests.get(
            url, params=params, headers={"User-Agent": USER_AGENT}, timeout=60
        )
        resp.raise_for_status()
        page = resp.json().get("features", [])
        features.extend(page)
        if len(page) < page_size:
            break
        offset += page_size
        time.sleep(0.5)
    return features
