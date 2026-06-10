"""Conexión a PostgreSQL/PostGIS vía SQLAlchemy.

Se expone un único Engine reutilizable (pool) construido a partir de
DATABASE_URL. El motor analítico solo precalcula y persiste en la DB; PostGIS
es el núcleo geoespacial (decisión técnica #5 de CLAUDE.md).
"""

from __future__ import annotations

import os

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

_engine: Engine | None = None


def get_engine() -> Engine:
    """Devuelve el Engine global, creándolo en el primer uso."""
    global _engine
    if _engine is None:
        url = os.environ["DATABASE_URL"]
        _engine = create_engine(url, pool_pre_ping=True, future=True)
    return _engine
