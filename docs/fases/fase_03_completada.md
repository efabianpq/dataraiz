# Fase 3 — Modelos de Valor de Mercado — Completada

**Fecha:** 2026-06-09
**Sesiones utilizadas:** 1
**Estado:** ✅ Completada

## Entregables completados

- [x] Los **4 modelos** se entrenan sin errores: LinearRegression,
  DecisionTreeRegressor(max_depth=8), RandomForestRegressor(100), XGBRegressor.
- [x] RF y XGB afinados con `RandomizedSearchCV(n_iter=20, cv=5)`.
- [x] `GET /analytics/metricas` retorna `{modelo, rmse, mae, r2, n_train}`.
- [x] `POST /analytics/entrenar` re-entrena y devuelve métricas de los 4 modelos.
- [x] **R² = 0.632 > 0.60** (modelo seleccionado: XGBoost, menor RMSE en test).
- [x] `analisis_inmueble.valor_estimado` no nulo en **302** filas = total de
  inmuebles con features completos; `brecha` calculada para las 302.
- [x] Modelos serializados en el volumen `analytics_models`
  (`/app/app/models/`): `best_model.joblib`, `preprocessor.joblib`,
  `metricas.json`.

## Modelo activo y métricas

Selección por menor RMSE en el set de test (split 80/20, `random_state=42`):

| Modelo | RMSE (COP) | MAE (COP) | R² |
|--------|-----------:|----------:|-----:|
| **XGBoost** (seleccionado) | **763.5 M** | **391.2 M** | **0.632** |
| RandomForest | 915.6 M | 424.5 M | 0.471 |
| LinearRegression | 1 234.3 M | 612.9 M | 0.039 |
| DecisionTree | 1 364.9 M | 596.0 M | −0.175 |

`n_train = 229`, `n_test = 58` (287 inmuebles tras filtrar outliers, de 302).

## Features y target

- **Target:** `precio` (COP), modelado en espacio logarítmico (`log1p`/`expm1`
  vía `TransformedTargetRegressor`).
- **Features (7):** `area_m2`, `habitaciones`, `banos`, `tipo_encoded`
  (apto=0, casa=1, lote=2, local=3), `dist_pot_m`, `dist_centrocentro_m`,
  `nivel_riesgo_encoded` (bajo=0, medio=1, alto=2; NULL ⇒ 0 = sin riesgo).
- **`precio_m2` NO es feature** (se calcula solo para filtrar outliers). Usarlo
  como predictor de `precio` introduciría fuga de datos
  (`precio ≈ precio_m2 × area_m2`), R² ≈ 0.99 y `brecha ≈ 0` inservible.
  Decisión confirmada con el usuario en esta sesión.

## Resultado de negocio (señal de oportunidad)

`brecha = (precio − valor_estimado) / valor_estimado × 100`
(positivo = sobrevalorado, negativo = subvalorado).

| Segmento | Inmuebles |
|----------|----------:|
| Muy subvalorados (brecha < −20%) | 17 |
| Subvalorados (−20% a 0%) | 129 |
| En rango (0% a +20%) | 128 |
| Sobrevalorados (> +20%) | 28 |

`brecha` media: +15.2% · rango: −94.9% a +1158.1% (sin overflow tras
migración 005).

## Pipeline de limpieza

1. `precio_m2 = precio / area_m2`.
2. Filtro de outliers **por tipo** (robusto): `precio` ≤ percentil 99,
   `precio_m2` dentro de `[p1, p99]` y dentro de ±3σ de la media. El criterio
   por percentiles evita el enmascaramiento que sufre el 3σ cuando un valor
   absurdo (p. ej. 360 M/m² en casas, 1 500 M/m² en lotes) corrompe media y σ.
3. Imputación de numéricos faltantes con la mediana por tipo (red de
   seguridad; los datos del piloto están completos).
4. Predicción y persistencia para **todos** los inmuebles con features
   completos, incluidos los atípicos (su `brecha` alta los marca como
   sobrevalorados).

## Problemas encontrados y soluciones aplicadas

1. **R² inicial de 0.25 (raw precio).** Predecir `precio` en COP directamente,
   con valores de 17 M a 30 000 M, hacía que los inmuebles caros dominaran el
   ajuste (DecisionTree y XGBoost incluso daban R² negativo por
   extrapolación). Solución: modelar el target en **espacio logarítmico**
   (`TransformedTargetRegressor` con `log1p`/`expm1`) y endurecer el filtro de
   outliers por percentiles. R² 0.25 → **0.632**; las métricas se reportan en
   COP (el `predict` retrocede el log internamente).
2. **Overflow potencial de `brecha`.** Con outliers extremos, la brecha
   porcentual superaba `NUMERIC(8,3)`. Migración `005_brecha_precision.sql`:
   `brecha` → `NUMERIC(12,2)`.
3. **XGBoost requería `libgomp1`** (runtime OpenMP) ausente en `python:3.11-slim`.
   Solución: instalarlo vía `apt-get` en el Dockerfile de analytics.

## Decisiones de implementación

- **Sin `precio_m2` como feature** (anti-leakage), confirmado con el usuario.
- **Target en log space**: estándar para precios muy sesgados; mantiene la
  interpretación en COP y mejora drásticamente el ajuste.
- **Un solo modelo para los 4 tipos** (apto/casa/lote/local) según el plan;
  `tipo_encoded` es feature. Modelos por tipo quedan como mejora futura.

## Deuda técnica generada

- [ ] **Valoración de `lote` poco confiable**: alta varianza de área/precio;
      el modelo sobreestima lotes baratos (los "más subvalorados" del ranking
      son lotes con `brecha` ≈ −95%, probablemente artefactos, no
      oportunidades reales). Considerar un modelo separado para lotes o
      excluirlos del ranking de oportunidades.
- [ ] **`nivel_riesgo_encoded` casi constante** (solo 2 inmuebles ≠ 0): aporta
      poca señal hasta ampliar la cobertura de `capa_riesgo` (deuda de Fase 1B).
- [ ] **Dataset pequeño (287 tras limpieza)**: R² mejorará con ≥ 500 inmuebles
      (más ciclos de scraping). Validación cruzada ya aplicada en RF/XGB.
- [ ] **SHAP / `shap_json`** aún no se calcula (columna existe desde 002);
      diferido (no estaba en los entregables de esta fase).
- [ ] Black/isort no instalados en la imagen `analytics` (convención de
      CLAUDE.md); el código se formateó manualmente.

## Estado del sistema al final de la fase

- 6 contenedores Docker arriba; `analytics` reconstruido con scikit-learn,
  XGBoost, pandas, numpy, joblib (+ `libgomp1`).
- `analisis_inmueble`: 302 filas con `valor_estimado` y `brecha`.
- Modelo activo: **XGBoost** serializado en el volumen `analytics_models`.
- Tests: 8/8 OK (`docker compose exec analytics pytest -v`).

## Próximos pasos (Fase 4 — Segmentación y comparables)

- Agrupar inmuebles en segmentos comparables (por tipo, zona, rango de área)
  y poblar la tabla `comparable` con los vecinos más parecidos de cada
  inmueble (distancia + diferencia de `precio_m2`), apoyándose en las
  variables espaciales y el `valor_estimado` ya calculados.
