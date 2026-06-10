# Fase 1 — Ingesta de Datos — Completada

**Fecha:** 2026-06-09
**Sesiones utilizadas:** 1
**Estado:** ✅ Completada

## Entregables completados

### Fase 1A — Scraper de Fincaraíz (Playwright + BullMQ)

- [x] `scrapers/src/fincaraiz.ts`: scraper que recorre los listados de venta
      de Fincaraíz para los 4 municipios piloto (Bucaramanga, Floridablanca,
      Girón, Piedecuesta) y los tipos `apto`, `casa`, `lote`, `local`,
      extrayendo los datos embebidos en `__NEXT_DATA__`
      (`props.pageProps.fetchResult.searchFast.data`) sin necesidad de
      visitar las páginas de detalle.
- [x] Respeta `robots.txt`, limita a 1 req/seg (`SCRAPING_RATE_LIMIT_MS`),
      reintentos con backoff y bloqueo de recursos pesados (imágenes,
      fuentes, CSS) vía `page.route`.
- [x] `scrapers/src/db.ts`: `upsertInmueble()` con `INSERT ... ON CONFLICT
      (url_anuncio) DO UPDATE` para deduplicar por URL del anuncio; geometría
      `ST_SetSRID(ST_MakePoint(lng, lat), 4326)`.
- [x] `scrapers/src/geocode.ts`: fallback de geocodificación con Nominatim
      (rate limit ~1.1s, restringido a Colombia) para anuncios sin
      coordenadas en el JSON embebido.
- [x] `scrapers/src/queue.ts`: worker BullMQ (`startWorker`) que procesa el
      job `fincaraiz` en la cola `scraping`.
- [x] Backend NestJS: `ScrapingModule`/`ScrapingService`/`ScrapingController`
      — `POST /scraping/run` encola el job, `GET /scraping/status/:jobId`
      consulta su estado, y `@Cron` dispara el scraping cada
      `SCRAPING_INTERVAL_HOURS` horas (configurable por `.env`).
- [x] Imagen `scrapers` migrada a `mcr.microsoft.com/playwright:v1.60.0-noble`
      (Chromium preinstalado, alineado con `playwright@1.60.0` exacto).

### Fase 1B — Datos oficiales POT y riesgo (GeoPandas/psycopg2)

- [x] `datos_oficiales/arcgis_utils.py`: helper compartido
      `fetch_arcgis_features()` para paginar endpoints ArcGIS REST
      `/query` (`resultOffset`/`resultRecordCount`, recorte por bbox del AMB,
      reproyección a SRID 4326 vía `outSR=4326`).
- [x] `datos_oficiales/pot_bucaramanga/cargar_pot.py`: carga 3 capas del POT
      (FeatureServer `POT_1G_FloridablancaLayers`) en `proyecto_pot`:
      `tratamiento_urbanistico`, `uso_suelo`, `via_proyectada`. Geometrías
      validadas con `ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(...), 4326))`.
- [x] `datos_oficiales/riesgo/cargar_riesgo.py`: carga la capa
      `Amenaza_Mov_Masa` del mismo FeatureServer en `capa_riesgo`
      (`categoria='movimiento_masa'`, `nivel` mapeado de `bajo/medio/alto`),
      forzando `ST_Multi(...)` para cumplir `GEOMETRY(MultiPolygon, 4326)`.
- [x] Ambos scripts son re-ejecutables: hacen `DELETE` por `tipo`/`categoria`
      antes de insertar, así una recarga no duplica datos.
- [x] `analytics/requirements.txt` + `requests==2.32.5`; nuevo bind-mount
      `./datos_oficiales:/app/datos_oficiales` en el servicio `analytics`.

## Métricas obtenidas

Resultado del job de scraping (`POST /scraping/run`, job `fincaraiz`):

```
pagesVisited: 25
itemsFound:   317
inserted:     315
updated:      0
conGeom:      302
geocodificados: 1
errores:      0
```

Validación en PostgreSQL/PostGIS:

```
=== Test Fase 1 ===
 inmuebles | inmuebles_con_geom | proyecto_pot | capa_riesgo | inmueble_geom_invalida
-----------+---------------------+--------------+-------------+------------------------
       315 |                 302 |         6825 |        2868 |                      0
```

- `inmueble`: 315 registros (≥ 200 ✅), 302 con geometría = 95.9% (≥ 80% ✅),
  0 geometrías inválidas, 315 URLs únicas (deduplicación OK).
  - Por tipo: apto=105, casa=103, lote=84, local=23.
  - Coordenadas dentro del AMB: lng [-73.2500, -72.9958], lat [6.8630, 7.1530].
- `proyecto_pot`: 6825 registros, 0 inválidos.
  - `tratamiento_urbanistico` (vigente): 3280
  - `uso_suelo` (vigente): 3452
  - `via_proyectada` (proyectado): 93
- `capa_riesgo`: 2868 registros, todos `MultiPolygon` válidos,
  `categoria='movimiento_masa'`.
  - `nivel='bajo'`: 612, `nivel='medio'`: 1187, `nivel='alto'`: 1069.

## Problemas encontrados y soluciones aplicadas

1. Problema: dependencia circular entre `scraping.module.ts` y
   `scraping.service.ts` (ambos importaban la constante `SCRAPING_QUEUE` uno
   del otro). Esto hacía que `@InjectQueue(SCRAPING_QUEUE)` se evaluara con
   `SCRAPING_QUEUE === undefined` (token `BullQueue_default`), mientras que
   `BullModule.registerQueue` sí registraba `BullQueue_scraping`, causando
   `UnknownDependenciesException` al arrancar Nest.
   Solución: se extrajo la constante a `scraping.constants.ts`, importada por
   ambos archivos sin ciclo.

2. Problema: `bullmq` incluye su propia copia de `ioredis` en
   `node_modules/bullmq/node_modules/ioredis`, con tipos incompatibles con la
   `ioredis` raíz instalada en `scrapers`. Pasar una instancia `new
   IORedis(...)` como `connection` del `Worker` fallaba en compilación
   (`TSError: Type 'Redis' is not assignable to type 'ConnectionOptions'`).
   Solución: se eliminó la dependencia `ioredis` de `scrapers/package.json` y
   se pasa un objeto plano `{ host, port, password }` (parseado de
   `REDIS_URL`) como `connection`, dejando que BullMQ cree su propio cliente
   internamente.

3. Problema: el endpoint `mcr.microsoft.com/playwright:v1.60.0-noble` exigió
   reconstruir la imagen `scrapers` con `npm ci`, lo cual falló porque
   `package-lock.json` no tenía las nuevas dependencias (`bullmq`, `pg`,
   `@types/pg`). Solución: `npm install` dentro del contenedor en ejecución
   (bind-mount actualiza el lockfile en el host) antes de `docker compose
   build`.

4. Investigación de fuentes oficiales para Fase 1B: no existe un FeatureServer
   POT único para todo el AMB. Se descartó
   `services3.arcgis.com/.../96_tratamientos_urbanisticos` (CRS EPSG:9377 que
   reproyecta a Armenia, Quindío — falso positivo). Se usó el FeatureServer
   `POT_1G_FloridablancaLayers`, que cubre Floridablanca pero cuyas capas caen
   dentro del bbox del AMB consultado.

## Deuda técnica generada

- [ ] **Catastro** (tabla mencionada en el plan): no se encontró fuente IGAC
      descargable programáticamente; `datos_oficiales/catastro/` queda vacío
      (solo `.gitkeep`). Pendiente para una fase posterior.
- [ ] **Cobertura geográfica del POT/riesgo**: las capas cargadas
      (`POT_1G_FloridablancaLayers`) cubren principalmente Floridablanca. Para
      Bucaramanga, Girón y Piedecuesta no se hallaron FeatureServers
      equivalentes con descarga directa; evaluar `Zonas_Normativas` /
      `1_Clasificación_del_territorio` de Bucaramanga (servicios ArcGIS
      detectados pero no integrados) u OSM/Overpass como proxy.
  - **Why:** se priorizó tener datos verificados y de calidad para al menos
    un municipio del AMB en esta sesión, en vez de mezclar fuentes no
    verificadas.
- [ ] El job de scraping programado (`@Cron`) no se ha observado en un ciclo
      real (`SCRAPING_INTERVAL_HOURS=6`); solo se validó el disparo manual vía
      `POST /scraping/run`.
- [ ] 13 anuncios (315 - 302) quedaron sin geometría tras geocodificación con
      Nominatim; revisar calidad de las direcciones de origen en una fase
      posterior si afecta el geoprocesamiento (Fase 2).

## Cambios al plan original

- Se agregó `datos_oficiales/arcgis_utils.py` como módulo compartido (no
  estaba especificado en el plan), para no duplicar la lógica de paginación
  ArcGIS entre `cargar_pot.py` y `cargar_riesgo.py`.
- Se usó `psycopg2` + `ST_GeomFromGeoJSON` directamente en lugar de GeoPandas
  para la carga de POT/riesgo: los datos ya llegan como GeoJSON en SRID 4326
  desde ArcGIS REST (`outSR=4326`), por lo que GeoPandas/Fiona/GDAL habrían
  agregado una dependencia pesada sin aportar transformación adicional.
  PostGIS valida (`ST_MakeValid`) y tipa (`ST_Multi`) las geometrías.
- Se agregó el bind-mount `./datos_oficiales:/app/datos_oficiales` al
  servicio `analytics` en `docker-compose.yml` (no detallado explícitamente
  en el plan, pero necesario para ejecutar los scripts de carga con
  `python3.11` dentro del contenedor que ya tiene `psycopg2`/`requests`).

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

- Tests backend: 3 suites / 5 tests OK (`docker compose exec backend npm run
  test`).
- Tests analytics: 1/1 OK (`docker compose exec analytics pytest -v`).
- `npx tsc --noEmit` en `scrapers`: sin errores.

## Próximos pasos (Fase 2)

- Geoprocesamiento: calcular variables espaciales por inmueble
  (`dist_pot_m`, `en_zona_riesgo`, etc.) usando `proyecto_pot` y
  `capa_riesgo` recién cargados, vía script GeoPandas + SQLAlchemy en
  `analytics`, procesado en lotes de 100 con endpoint
  `POST /analytics/geoprocesar`.
- Considerar ampliar cobertura de `proyecto_pot`/`capa_riesgo` a Bucaramanga,
  Girón y Piedecuesta (ver deuda técnica) antes o durante Fase 2 si el
  geoprocesamiento muestra huecos relevantes fuera de Floridablanca.
