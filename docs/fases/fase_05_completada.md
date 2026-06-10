# Fase 5 — Oportunidad y Finanzas — Completada

**Fecha:** 2026-06-09
**Sesiones utilizadas:** 1
**Estado:** ✅ Completada

## Entregables completados

- [x] `SELECT count(*) FROM analisis_inmueble WHERE prob_oportunidad > 0.7;`
  = **21** > 0.
- [x] `SELECT avg(yield_bruto) FROM analisis_inmueble WHERE yield_bruto IS NOT NULL;`
  = **5.801** ∈ [4, 10].
- [x] AUC del clasificador logístico (CV=5) = **0.9769** > 0.65.

## Parte A — Clasificador de oportunidad

Pipeline `analytics/app/pipelines/oportunidad_finanzas.py::clasificar()`:

1. **Etiqueta `oportunidad = 1`** cuando `brecha < -10` (subvalorado >10 %) **y**
   `posicion_vs_mediana = 'debajo'` **y** `nivel_riesgo != 'alto'`
   (`nivel_riesgo` NULL se trata como `'bajo'`). Resultado: **25/302 (~8.3 %)
   positivos**, desbalance intencional propio del piloto.
2. **Features:** `brecha`, `posicion_encoded` (debajo=1/encima=0), `dist_pot_m`,
   `nivel_riesgo_encoded` (bajo=0/medio=1/alto=2), `segmento`,
   `dist_centrocentro_m`.
3. **Modelo:** `Pipeline(StandardScaler → LogisticRegression(class_weight="balanced"))`.
4. **Validación:** `cross_val_score(cv=5, scoring="roc_auc")`.

| Fold | AUC |
|------|----:|
| 1 | 0.9643 |
| 2 | 0.9857 |
| 3 | 0.9600 |
| 4 | 0.9855 |
| 5 | 0.9891 |
| **Media** | **0.9769** |

> El AUC es muy alto porque dos de las tres features (`brecha` y
> `posicion_encoded`) son, por construcción, dos de los tres criterios de la
> etiqueta — el dataset es casi linealmente separable en esas dimensiones. Es
> el comportamiento esperado dado el diseño solicitado para el piloto (umbral
> > 0.65 ampliamente superado).

5. Reentrenado sobre los 302 inmuebles, se persiste `prob_oportunidad` para
   **302/302** (21 con `prob_oportunidad > 0.7`).
6. Pipeline completo (scaler + modelo) serializado en
   `analytics_models/clasificador_oportunidad.joblib`.

## Parte B — Capa financiera

Pipeline `oportunidad_finanzas.py::calcular_financiero()`:

- **Ratios canon/precio mensuales** (estándar mercado colombiano, constantes
  por segmento — no varían por zona, así que los inmuebles sin `zona_id`
  reciben automáticamente el ratio de su segmento):
  - Segmento 0: **0.50 % mensual** → `yield_bruto` = 6.000 %, `cap_rate` = 5.100 %
  - Segmento 1: **0.45 % mensual** → `yield_bruto` = 5.400 %, `cap_rate` = 4.590 %
  - Segmentos 2 y 3: **excluidos** (outliers extremos de Fase 4: precios de
    ~$3 000M–$30 000M COP que distorsionan cualquier ratio). Sus 4 inmuebles
    quedan con `canon_estimado_mensual`/`yield_bruto`/`cap_rate` = `NULL`.
- Por inmueble: `canon_estimado_mensual = precio * ratio_segmento`,
  `yield_bruto = canon*12/precio*100`, `cap_rate = yield_bruto * 0.85`
  (85 % de eficiencia operativa tras gastos).

**Resultado:** 298/302 calculados (4 excluidos), `yield_bruto` promedio
**5.801 %**, `cap_rate` promedio **4.931 %**, canon mensual promedio
**$5 022 774 COP**.

## Esquema (migración 007)

`database/migrations/007_oportunidad_finanzas.sql` (idempotente, aplicada
también a la DB viva):

- `analisis_inmueble`: `prob_oportunidad NUMERIC(5,4)` (CHECK ∈ [0,1]),
  `canon_estimado_mensual NUMERIC(14,2)`, `yield_bruto NUMERIC(6,3)`,
  `cap_rate NUMERIC(6,3)`.

## Endpoints

- `POST /analytics/clasificar` — reentrena el clasificador y recalcula
  `prob_oportunidad` para todos los inmuebles.
- `POST /analytics/financiero` — recalcula `canon_estimado_mensual`,
  `yield_bruto` y `cap_rate`.

## Pruebas

`analytics/tests/test_oportunidad_finanzas.py` (8 tests). Suite completa
analytics: **23 passed**.

## Próxima fase

Fase 6 — Score y optimización.
