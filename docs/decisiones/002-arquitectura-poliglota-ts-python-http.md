# ADR 002 — Arquitectura políglota: TypeScript + Python comunicados por HTTP

- **Estado:** Aceptada
- **Fecha:** 2026-06 (vigente al cierre de Fase 8)

## Contexto

El proyecto necesita, a la vez, un frontend y una API web modernos y un motor
de ciencia de datos. El ecosistema web maduro vive en TypeScript (Next.js,
NestJS); el ecosistema de ML maduro vive en Python (scikit-learn, XGBoost,
pymoo, SHAP, GeoPandas/PostGIS). Forzar todo a un solo lenguaje implicaría usar
librerías inferiores en uno de los dos dominios.

## Decisión

Adoptar una **arquitectura políglota** con una frontera HTTP clara:

- **Frontend y backend en TypeScript:** Next.js 16 (dashboard + mapa) y
  NestJS 11 (API REST bajo `/api`, autenticación, lógica de negocio).
- **Motor analítico en Python 3.11:** FastAPI expone los pipelines de ML y
  geoprocesamiento.
- **Comunicación por HTTP/JSON** entre NestJS y FastAPI; el contrato es la API
  REST, no un binding de lenguaje. Cada servicio es un contenedor Docker
  independiente.

## Consecuencias

- **Positivas:** cada dominio usa las mejores herramientas de su ecosistema;
  los servicios escalan y se despliegan por separado; los límites están
  tipados (Pydantic en Python, class-validator/DTOs en NestJS). El backend
  permanece delgado y la complejidad de ML queda aislada.
- **Negativas / costo:** dos *toolchains*, dos suites de tests (Jest + pytest)
  y la latencia/serialización de la llamada HTTP entre servicios. Se mitiga
  manteniendo esa llamada al mínimo: el backend solo invoca a FastAPI para lo
  que no se puede precalcular (NSGA-II, ver ADR 001).
