# Fase 4 — Segmentación y Comparables — Completada

**Fecha:** 2026-06-09
**Sesiones utilizadas:** 1
**Estado:** ✅ Completada

## Entregables completados

- [x] **Coeficiente de silueta del K-means seleccionado = 0.4316 > 0.30.**
- [x] `SELECT DISTINCT segmento FROM analisis_inmueble;` retorna los **k=4**
  clusters (`{0,1,2,3}`).
- [x] `SELECT count(*) FROM comparable;` = **1510** ≥ 302 × 3 = 906
  (promedio exacto de **5.0** comparables por inmueble).
- [x] `SELECT * FROM comparable LIMIT 5;` muestra datos coherentes
  (inmuebles distintos, mismo tipo, `distancia_pca ≥ 0`, posición válida).
- [x] `POST /analytics/segmentar` y `GET /analytics/segmentos` operativos.
- [x] Artefactos serializados en el volumen `analytics_models`
  (`/app/app/models/`): `scaler_segmentacion.joblib`, `pca_model.joblib`,
  `kmeans_model.joblib` (+ `segmentacion.json`).

## Parte A — Segmentación

Pipeline `analytics/app/pipelines/segmentacion.py`:

1. **StandardScaler** sobre 9 features (las mismas del modelo de valor más
   `precio_m2`, `valor_estimado`, `brecha`).
2. **PCA(n_components=5)** → 84.1 % de varianza explicada.
3. **K-means** con k=3,4,5,6 evaluado por silueta sobre el espacio PCA.

| k | Silueta |
|---|--------:|
| 3 | 0.4294 |
| **4** | **0.4316** ← seleccionado |
| 5 | 0.4118 |
| 6 | 0.4322 |

**Selección de k:** se elige la mayor silueta, pero ante cuasi-empates (dentro
de `TOL_SILUETA = 0.5 %` relativo) se prefiere el k más pequeño. k=6 (0.4322)
supera a k=4 (0.4316) por solo 0.0006 — ruido estadístico —, así que se
selecciona **k=4**, coherente con las 4 zonas piloto y sin partir el mercado en
segmentos redundantes.

**Conteo por segmento:** `{0: 199, 1: 99, 2: 3, 3: 1}`. Los segmentos 2 y 3 son
pequeños porque agrupan inmuebles atípicos (valores/brechas extremos) que se
separan del grueso del mercado para cualquier k; es un rasgo intrínseco de los
datos, no del método. No afecta los entregables: los 302 inmuebles obtienen sus
5 comparables gracias a los niveles de respaldo (ver Parte B).

## Parte B — Comparables

Para cada inmueble se eligen los **5 más similares** en espacio PCA por distancia
euclidiana, con un filtrado en cascada:

1. **Nivel 1:** mismo tipo + misma zona o adyacente (±1).
2. **Nivel 2:** si quedan menos de 5, todas las zonas del mismo segmento.
3. **Nivel 3:** si aún quedan menos, todo el mismo tipo.

Cada fila de `comparable` guarda:
- `distancia_pca` (también replicada en la columna legada `distancia`),
- `dif_precio_m2` = `precio_m2` del inmueble − `precio_m2` del comparable,
- `posicion_vs_mediana` = posición del comparable respecto a la mediana de
  `precio_m2` del conjunto de 5.

En `analisis_inmueble.posicion_vs_mediana` se marca la posición del **propio
inmueble** frente a la mediana de sus comparables: **138 `debajo`** (potenciales
oportunidades) y **164 `encima`**.

> Como todos los inmuebles del piloto se capturaron el mismo día (2026-06-10),
> el criterio de recencia no aplica y la similitud PCA es el único criterio.

## Esquema (migración 006)

`database/migrations/006_segmentacion.sql` (idempotente, aplicada también a la
DB viva):

- `analisis_inmueble`: `segmento INTEGER`, `posicion_vs_mediana VARCHAR(10)`
  (CHECK ∈ {encima, debajo}) + índice `idx_analisis_inmueble_segmento`.
- `comparable`: `distancia_pca NUMERIC(12,6)`, `posicion_vs_mediana VARCHAR(10)`
  (CHECK ∈ {encima, debajo}).

## Endpoints

- `POST /analytics/segmentar` — recalcula segmentos y comparables completos
  (idempotente: borra y reconstruye `comparable`).
- `GET /analytics/segmentos` — resumen: `{k, silueta, n_inmuebles,
  conteo_por_segmento, siluetas_por_k, comparables_insertados}`.

## Pruebas

`analytics/tests/test_segmentacion.py` (7 tests). Suite completa: **15 passed**.

## Próxima fase

Fase 5 — Oportunidad y finanzas.
