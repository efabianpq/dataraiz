# Fase 2 — Geoprocesamiento — Completada

**Fecha:** 2026-06-09
**Sesiones utilizadas:** 1
**Estado:** ✅ Completada

## Entregables completados

- [x] `database/migrations/004_geoprocesamiento.sql`:
  - Registra el SRID **9377** (MAGNA-SIRGAS 2018 / Origen-Nacional) en
    `spatial_ref_sys` — sin esto `ST_Transform(geom, 9377)` falla.
  - Agrega a `analisis_inmueble` las columnas `dist_pot_m`, `en_zona_riesgo`,
    `nivel_riesgo` (CHECK bajo/medio/alto), `dist_centrocentro_m`,
    `zona_id` (FK a `zona`).
  - `CREATE INDEX IF NOT EXISTS` de los 4 índices GIST + índice por `zona_id`.
- [x] `analytics/app/pipelines/geoprocesamiento.py`: pipeline que calcula las
  5 variables espaciales delegando el cálculo a PostGIS, orquestado con
  SQLAlchemy, en lotes de 100, idempotente (UPSERT `ON CONFLICT
  (inmueble_id)`), con logging estructurado `structlog` (JSON). Ejecutable
  como script: `python3.11 -m app.pipelines.geoprocesamiento`.
- [x] `analytics/app/db.py`: Engine SQLAlchemy reutilizable desde `DATABASE_URL`.
- [x] `analytics/app/logging_config.py`: configuración de `structlog`.
- [x] Endpoint `POST /analytics/geoprocesar` en FastAPI (cuerpo opcional
  `{"inmueble_ids": [...]}`; sin cuerpo procesa todos los inmuebles con geom).
- [x] `analytics/tests/test_geoprocesar.py`: tests de integración del endpoint
  y de los criterios de éxito.
- [x] Variables calculadas para **302/302** inmuebles con geom (100% ≥ 90%).
- [x] Índices espaciales GIST verificados en `inmueble`, `zona`,
  `proyecto_pot`, `capa_riesgo`.

## Variables calculadas (en `analisis_inmueble`)

| Variable | Definición | Método PostGIS |
|----------|-----------|----------------|
| `dist_pot_m` | Distancia en metros al proyecto POT más cercano (cualquier tipo) | KNN `<->` (índice GIST, 4326) para 5 candidatos + `ST_Distance(ST_Transform(...,9377))` y MIN |
| `en_zona_riesgo` | True si intersecta algún polígono de `capa_riesgo` | `ST_Intersects` (derivado de `nivel_riesgo IS NOT NULL`) |
| `nivel_riesgo` | Nivel del polígono de riesgo más severo que lo intersecta | `ST_Intersects` + orden alto>medio>bajo, `LIMIT 1` |
| `dist_centrocentro_m` | Distancia en metros a Plaza de los Búcaros (7.1197, -73.1227) | `ST_Distance(ST_Transform(...,9377))` |
| `zona_id` | Zona/municipio que contiene el inmueble | `ST_Contains`; ante solape de bboxes elige la de menor área |

## Métricas obtenidas

Criterios de éxito de la Fase 2:

```
=== Test Fase 2 ===
 avg_dist_pot_m  | 2178.1   (criterio: < 5000)        ✅
 en_zona_riesgo  | 2        (criterio: > 0)           ✅
 con_dist_pot    | 302      (criterio: ≥ 271 = 90%)   ✅  (100%)
```

Distribución:
- `dist_pot_m`: min 0.0 m (dentro de un polígono POT), max 15 297 m, media 2 178 m.
- `dist_centrocentro_m`: min 21.6 m, max 29 991.6 m.
- `zona_id`: 287/302 con zona; 15 caen fuera de las 4 bounding boxes
  provisionales de los municipios piloto.
- `nivel_riesgo`: 2 inmuebles en `bajo` (los 2 que intersectan la capa de
  amenaza por movimiento en masa de Floridablanca); el resto NULL.

Ejecución del pipeline (`POST /analytics/geoprocesar`):
`{"inmuebles_con_geom":302,"procesados":302,"actualizados":302,"lotes":4,"errores":0}`

Idempotencia verificada: una 2ª corrida mantiene 302 filas (UPSERT, sin
duplicados).

Tests: 3/3 OK (`docker compose exec analytics pytest -v`).

## Problemas encontrados y soluciones aplicadas

1. **SRID 9377 ausente en `spatial_ref_sys`.** PostGIS 3.4 trae el antiguo
   3116 (zona Bogotá) pero no el 9377 nacional; `ST_Transform(geom, 9377)`
   fallaba con *"Cannot find SRID (9377) in spatial_ref_sys"*. Solución:
   insertar la definición oficial de EPSG:9377 (proj4 + WKT) en la migración
   004. Verificado: Plaza de los Búcaros → (4 986 456.6 E, 2 344 717.7 N) y
   0.009° de latitud ≈ 994.5 m (correcto).

2. **SQLAlchemy 2.0 "autobegin".** Al usar `engine.connect()` y ejecutar el
   SELECT inicial, la conexión auto-inicia una transacción; el posterior
   `with conn.begin()` por lote lanzaba *"This connection has already
   initialized a SQLAlchemy Transaction()"*. Solución: leer los IDs en una
   conexión de corta vida (cerrada antes del bucle) y procesar cada lote en su
   propia transacción con `with engine.begin() as conn:`.

## Decisiones de implementación

- **Cálculo en PostGIS-SQL, no en GeoPandas** (confirmado con el usuario en
  esta sesión). Alineado con la decisión técnica #5 de CLAUDE.md ("todos los
  resultados precalculados viven en la DB; el backend solo lee"). Evita
  introducir GDAL/Fiona/GeoPandas en la imagen `slim` y reimplementar en
  Python lo que PostGIS hace nativo (KNN, reproyección, point-in-polygon). El
  script Python orquesta (lotes, idempotencia, logging, endpoint).
- **Vecino más cercano en metros**: se usa el operador KNN `<->` (asistido por
  el índice GIST en 4326) para traer los 5 candidatos más cercanos y luego se
  calcula la distancia métrica real reproyectando a 9377, tomando el mínimo.
  Esto da la verdadera distancia en metros sin perder el rendimiento del
  índice.

## Deuda técnica generada

- [ ] 15 inmuebles quedan sin `zona_id` por caer fuera de las bounding boxes
      provisionales de `zona` (datos semilla de Fase 0). Se refinará cuando se
      carguen polígonos de barrio/sector reales.
- [ ] `en_zona_riesgo` solo marca 2 inmuebles porque `capa_riesgo` cubre
      principalmente laderas de Floridablanca (deuda heredada de Fase 1B:
      falta cobertura de amenaza para Bucaramanga/Girón/Piedecuesta).
- [ ] `dist_pot_m` máximo de ~15 km para inmuebles lejos de la cobertura POT
      (centrada en Floridablanca); mejorará al ampliar `proyecto_pot` al resto
      del AMB.
- [ ] Black/isort no están instalados en la imagen `analytics` (convención de
      CLAUDE.md); el código se formateó manualmente. Evaluar agregarlos como
      dependencias de desarrollo.

## Estado del sistema al final de la fase

- 6 contenedores Docker arriba; `analytics` reconstruido con `structlog`.
- `analisis_inmueble`: 302 filas con las 5 variables de contexto espacial.
- SRID 9377 registrado y operativo para cálculos de distancia en metros.

## Próximos pasos (Fase 3 — Modelos de Valor)

- Pipeline de estimación de valor de mercado (scikit-learn / XGBoost) en
  `analytics`, usando como features `precio_m2`, `area_m2`, `habitaciones`,
  `banos`, `tipo` y las variables espaciales recién calculadas
  (`dist_pot_m`, `dist_centrocentro_m`, `en_zona_riesgo`, `zona_id`).
- Persistir `valor_estimado`, `brecha` y `shap_json` en `analisis_inmueble`
  (columnas ya existentes desde la migración 002).
