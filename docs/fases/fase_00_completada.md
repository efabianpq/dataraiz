# Fase 0 — Entorno y Esqueletos — Completada

**Fecha:** 2026-06-09
**Sesiones utilizadas:** 1
**Estado:** ✅ Completada

## Entregables completados

- [x] `docker-compose.yml` con los 6 servicios: db (PostGIS), redis, backend
      (NestJS), analytics (FastAPI), frontend (Next.js), scrapers (Playwright)
- [x] Esqueleto NestJS 11 con módulo de health check (`GET /health` →
      `{"status":"ok"}`)
- [x] Esqueleto FastAPI (Python 3.11 explícito) con `GET /health` →
      `{"status":"ok"}`
- [x] Esqueleto Next.js 16 con página principal "DataRaíz - En construcción"
- [x] Schema SQL inicial: `inmueble`, `zona`, `proyecto_pot`, `capa_riesgo`,
      `analisis_inmueble`, `comparable`, `usuario`, `watchlist`, `alerta`
      (migraciones 001-003, con índices GIST y datos semilla de zonas piloto)
- [x] `.env.example` con todas las variables de Apéndice A
- [x] `README.md` con instrucciones de arranque y comandos frecuentes

## Métricas obtenidas

Resultado del script de verificación de la Fase 0:

```
=== Test Fase 0 ===
✅ Backend     curl http://localhost:3001/health -> {"status":"ok"}
✅ Analytics   curl http://localhost:8000/health -> {"status":"ok"}
✅ Frontend    curl http://localhost:3000 -> contiene "DataRaíz"
✅ DB tablas   9/9 tablas del modelo de datos presentes (verificado por nombre)
✅ PostGIS     PostGIS_Version() -> 3.4 USE_GEOS=1 USE_PROJ=1 USE_STATS=1
```

- Registros en DB: `zona` = 4 (municipios piloto), resto de tablas vacías (0)
- `docker compose ps`: 6/6 servicios `Up`, db y redis `healthy`

## Problemas encontrados y soluciones aplicadas

1. Problema: el bind-mount de `database/migrations` a
   `/docker-entrypoint-initdb.d` oculta los scripts de inicialización propios
   de la imagen `postgis/postgis`, que normalmente crean la extensión PostGIS.
   Solución: se añadió `001_postgis_extension.sql` como primera migración,
   con `CREATE EXTENSION IF NOT EXISTS postgis` y `postgis_topology`.

2. Problema: el conteo de tablas con
   `SELECT count(*) FROM information_schema.tables WHERE table_schema='public'`
   da 12 en vez de 9, porque PostGIS agrega `spatial_ref_sys` (tabla) y las
   vistas `geometry_columns`/`geography_columns` al schema `public`.
   Solución: se verificó con un conteo filtrado por los 9 nombres de tabla
   esperados, confirmando que las 9 están presentes. Documentado en CLAUDE.md
   como comportamiento esperado de PostGIS, no un defecto del esquema.

3. Problema: bind-mount de código fuente (`./backend:/app`, etc.) sobrescribe
   `node_modules` instalado durante el build de la imagen.
   Solución: volúmenes nombrados dedicados para `node_modules` (backend,
   frontend, scrapers) y para `.next` (frontend), de forma que Docker
   conserva el contenido instalado en la imagen al montar el volumen.

4. Limpieza: se eliminó `cloudflared.deb` (instalador de ~18MB) que estaba
   suelto en la raíz del repo y no formaba parte de los entregables.

## Deuda técnica generada

- [ ] shadcn/ui no configurado todavía (diferido a Fase 7B)
- [ ] scrapers es un worker placeholder (heartbeat de log); sin scrapers
      reales hasta Fase 1A
- [ ] Sin healthchecks de Docker para backend/analytics/frontend (solo db y
      redis tienen healthcheck); evaluar si se necesitan antes de Fase 7

## Cambios al plan original

Ninguno relevante. Se mantuvo la estructura de Apéndice B de
`docker-compose.yml`, agregando volúmenes nombrados para hot-reload
(node_modules, .next, modelos de analytics) no detallados explícitamente en
el apéndice pero necesarios para que el bind-mount de código fuente funcione
sin romper las dependencias instaladas en build.

## Estado del sistema al final de la fase

`docker compose ps`:

```
NAME                   IMAGE                    SERVICE     STATUS
dataraiz-analytics-1   dataraiz-analytics       analytics   Up
dataraiz-backend-1     dataraiz-backend         backend     Up
dataraiz-db-1          postgis/postgis:16-3.4   db          Up (healthy)
dataraiz-frontend-1    dataraiz-frontend        frontend    Up
dataraiz-redis-1       redis:7-alpine           redis       Up (healthy)
dataraiz-scrapers-1    dataraiz-scrapers        scrapers    Up
```

## Próximos pasos (Fase 1)

- Objetivo principal: ingesta de datos reales — scraper de Fincaraíz (Fase 1A)
  para poblar la tabla `inmueble`, y carga de capas oficiales (POT, catastro,
  riesgo) en `proyecto_pot` y `capa_riesgo` (Fase 1B).
- Consideraciones especiales:
  - El worker `scrapers` ya corre con `node:20-bookworm-slim` (glibc) listo
    para instalar los navegadores de Playwright.
  - Respetar `SCRAPING_RATE_LIMIT_MS` y `PILOT_CITIES` desde `.env`.
  - Las geometrías deben cargarse en SRID 4326; usar `ST_Transform(geom, 9377)`
    solo para cálculos de distancia.
