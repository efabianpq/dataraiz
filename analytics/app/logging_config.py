"""Configuración de logging estructurado (structlog) para el motor analítico."""

from __future__ import annotations

import logging
import os

import structlog


def configure_logging() -> None:
    """Configura structlog con salida JSON y nivel desde LOG_LEVEL."""
    level_name = os.environ.get("LOG_LEVEL", "info").upper()
    level = getattr(logging, level_name, logging.INFO)

    logging.basicConfig(format="%(message)s", level=level)
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )
