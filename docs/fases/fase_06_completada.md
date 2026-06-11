# Fase 6 — Score integrado, explicabilidad (SHAP) y optimización (NSGA-II) — Completada

**Fecha:** 2026-06-10
**Sesiones utilizadas:** 1
**Estado:** ✅ Completada

## Entregables completados

- [x] `SELECT max(score), min(score), avg(score) FROM analisis_inmueble;`
  → **100.00 / 0.00 / ~57** (distribución 0–100).
- [x] `GET /analytics/score/{id}/explicacion` retorna JSON con `score`,
  `prob_oportunidad`, `brecha`, `yield_bruto` y `shap_json` (contribuciones
  ordenadas por `abs(impact)` descendente).
- [x] `POST /analytics/optimizar` responde en **< 1 s** (corte a 8 s) con
  **≥ 3 inmuebles** en el frente de Pareto.
- [x] SHAP calculado y persistido para **todos los inmuebles con datos
  completos** (con_score = con_shap = con_yield, alineados).
- [x] Suite analytics completa: **32 passed**.

> Nota de reproducibilidad: el modelo de valor de Fase 3 ahora es **determinista**
> (`n_jobs=1`; ver sección final). Las cifras exactas (nº de inmuebles con datos
> completos, avg de score) dependen del dataset vigente, que **creció durante la
> sesión** porque el scraper programado se ejecutó (315→519 inmuebles). Tras
> re-correr la cadena quedan ~415 inmuebles con datos completos.

## Parte A — Score integrado (`scoring.calcular_score`)

Combina cinco señales precalculadas en un score único 0–100:

```
score = 100 * minmax(
    W_OPORTUNIDAD * prob_oportunidad
  + W_BRECHA      * (-brecha_norm)      (más subvalorado ⇒ mejor)
  + W_YIELD       * yield_bruto_norm
  + W_RIESGO      * (1 - riesgo_norm)   (bajo=0, medio=1, alto=2)
  + W_COMPS       * posicion_comp_norm  (debajo=1, encima=0)
)
```

- **Pesos configurables por entorno** (`SCORE_W_OPORTUNIDAD=0.30`,
  `SCORE_W_BRECHA=0.25`, `SCORE_W_YIELD=0.25`, `SCORE_W_RIESGO=0.10`,
  `SCORE_W_COMPS=0.10`); si faltan o son inválidos se usan los default.
- **Normalización min-max por columna** sobre el dataset de inmuebles con datos
  completos (`yield_bruto IS NOT NULL`), robusta ante columnas constantes
  (devuelve 0). El compuesto se vuelve a normalizar a [0, 100].
- Los inmuebles atípicos (segmento 2, sin `yield_bruto`) reciben **`score = NULL`**.
- Resumen en `analytics_models/score.json`.

## Parte B — Explicabilidad con SHAP (`scoring.calcular_shap`)

- Reutiliza el modelo de valor de Fase 3 (`best_model.joblib`, un
  `TransformedTargetRegressor` que envuelve un `XGBRegressor`) y el
  `preprocessor.joblib`.
- **Selección de explicador robusta:** `shap.TreeExplainer` para modelos de
  árbol (XGBoost/RandomForest/DecisionTree, caso habitual); explicador agnóstico
  (`shap.Explainer` sobre `predict`) como respaldo si el mejor modelo por RMSE
  resultara lineal. Esto evita el `InvalidModelError` de `TreeExplainer` ante
  modelos no soportados.
- Para cada inmueble persiste en `analisis_inmueble.shap_json` la lista de
  contribuciones `{feature, value, impact}` de las 7 features del modelo,
  ordenada por `abs(impact)` descendente.
- Los valores SHAP explican el target en espacio **`log1p(precio)`** (el modelo
  se entrena sobre el log del precio); el signo y la magnitud relativa son lo
  relevante para la interpretación.
- Endpoint `GET /analytics/score/{inmueble_id}/explicacion`.

## Parte C — Optimización multicriterio NSGA-II (`scoring.optimizar`)

- `POST /analytics/optimizar` con cuerpo opcional `{presupuesto_max, zona_ids,
  tipos, tolerancia_riesgo}` (omitir un criterio = no filtrar por él).
- Filtra candidatos por presupuesto, zonas, tipos y tolerancia de riesgo
  (`tolerancia_riesgo` = nivel máximo aceptado; `bajo`/`medio`/`alto`).
- **pymoo NSGA-II** sobre una variable de decisión entera (índice de inmueble),
  3 objetivos: maximizar `yield_bruto` (como `-yield`), minimizar `precio`,
  minimizar `nivel_riesgo` encoded.
- **Configuración para < 10 s:** `pop_size = min(50, n_candidatos)`,
  `n_gen = 30`, con un **corte por tiempo de 8 s** implementado vía bucle
  manual `algorithm.next()` (se respetan ambos límites). Operadores enteros
  (`IntegerRandomSampling`, `SBX`+`PM` con `RoundingRepair`).
- Devuelve el frente de Pareto (ordenado por `yield_bruto` desc), garantizando
  **3 ≤ n ≤ 20**: si NSGA-II devuelve menos de 3 se completa con los mejores por
  yield; si devuelve más de 20 se conservan los de mayor yield.

## Endpoints añadidos

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/analytics/calcular_score` | Calcula `score` (0–100) de los inmuebles con datos completos |
| POST | `/analytics/calcular_shap` | Calcula y persiste `shap_json` por inmueble |
| GET  | `/analytics/score/{id}/explicacion` | Detalle: score + drivers SHAP de un inmueble |
| POST | `/analytics/optimizar` | Frente de Pareto (NSGA-II) según criterios del usuario |

## Cambios técnicos

- `analytics/requirements.txt`: `shap==0.46.0`, `pymoo==0.6.1.3`.
- `analytics/app/pipelines/scoring.py` (nuevo): score + SHAP + NSGA-II.
- `analytics/app/main.py`: 4 endpoints nuevos; versión `0.4.0`.
- `analytics/tests/test_scoring.py` (nuevo): **9 tests** (todos en verde).
- `database/migrations/008_score_optimizacion.sql`: `CHECK` de rango para
  `analisis_inmueble.score` (0–100; las columnas `score`/`shap_json` ya existían
  desde la migración 002).
- **`analytics/Dockerfile`:** se añadió `--reload-exclude *.joblib`/`*.json` al
  comando de uvicorn. El watcher de `--reload` reiniciaba el servidor cada vez
  que un pipeline escribía un artefacto en `app/models`, **cortando las
  peticiones HTTP de entrenamiento/scoring en curso** (los tests no lo detectan
  porque usan `TestClient` en proceso). Con la exclusión, los endpoints pesados
  (`/entrenar`, `/calcular_shap`) responden de forma estable por HTTP.

## Determinismo del modelo de valor (resuelto) y crecimiento del dataset

Durante esta fase se hicieron dos observaciones importantes sobre Fase 3:

1. **No determinismo del entrenamiento → resuelto.** El modelo de valor se
   ajustaba con `n_jobs=-1`, lo que volvía el resultado no reproducible: con
   multihilo el ajuste de XGBoost varía a nivel de punto flotante y el orden de
   ejecución paralelo de `RandomizedSearchCV` alteraba hasta los hiperparámetros
   seleccionados. **Fix:** en `analytics/app/pipelines/modelos_valor.py` los
   estimadores usan `n_jobs=1` (XGBoost además `tree_method="exact"`) y las
   búsquedas `RandomizedSearchCV` también `n_jobs=1`. Verificado: corridas
   repetidas sobre un dataset fijo dan R² idéntico bit a bit. El test
   `test_modelos_valor.py::test_r2_supera_umbral` (umbral 0.60) **pasa**.

2. **El dataset creció durante la sesión.** El scraper programado (@Cron) disparó
   su ejecución e **insertó 204 inmuebles y actualizó 190** (de 315 a 519
   inmuebles; `analisis_inmueble` de 302 a 502 filas). Por eso las cifras de esta
   fase superan a las de Fases 3–5: tras re-ejecutar la cadena completa quedan
   **415 inmuebles con datos completos** (score/SHAP/yield, todos alineados),
   modelo XGBoost con **R² ≈ 0.66–0.73** según el dataset vigente
   (n_train=382). El R² ya no varía por el modelo (es determinista), sino solo
   cuando el scraper cambia los datos de entrada, lo cual es el comportamiento
   esperado.

**Suite completa: 32 passed** (`docker compose exec analytics pytest`).
