# ADR 004 — Robustez del modelo de valor: filtro IQR y R² validada por CV

- **Estado:** Aceptada
- **Fecha:** 2026-06-11 (Fase 8 — Validación y cierre)

## Contexto

El scraper crece el dataset de forma continua (`@Cron`). Durante la validación
de Fase 8, con el dataset en 700 inmuebles, el modelo de valor degradó y el
test `test_r2_supera_umbral` falló: la R² del split único de test cayó por
debajo de 0.60 y oscilaba entre ~0.49 y ~0.59 entre ejecuciones.

Dos causas: (1) el filtro de outliers anterior (percentiles p1/p99 + ±3σ sobre
`precio_m2`) no contenía los valores absurdos de los anuncios (p. ej. 515
COP/m² por área en unidad errónea, o 2.9 B COP/m²), porque la media y la σ que
usaba quedan corrompidas por esas mismas colas; (2) asignar un umbral fijo a la
R² de un **único split** la vuelve inestable sobre un test pequeño (n ≈ 135).

## Decisión

1. **Filtro de outliers por regla de Tukey (IQR).** Recortar por tipo a
   `[Q1 − 1.5·IQR, Q3 + 1.5·IQR]` sobre `precio` y `precio_m2`. Los cuartiles
   no se dejan arrastrar por las colas, así que el recorte es estable aunque el
   dataset crezca con ruido.
2. **Medir la calidad con R² validada por CV (5-fold), no con el split único.**
   El entrenamiento ahora reporta `r2_cv` y `r2_cv_std`, y el test de umbral
   valida `r2_cv > 0.60`. La R² de CV promedia el ruido del muestreo.

## Evidencia (piloto, 700 inmuebles)

| Filtro                | n   | R² (CV, media) | R² (CV, σ entre folds) |
|-----------------------|-----|----------------|------------------------|
| Anterior (p1/p99 + 3σ)| 674 | 0.514          | 0.084                  |
| **IQR k = 1.5**       | 607 | **0.643**      | **0.035**              |

El filtro IQR subió la R² validada de ~0.51 a ~0.64 y redujo a menos de la
mitad su varianza entre folds. Tras el cambio, RMSE bajó de ~875 M a ~350 M COP
y MAE de ~330 M a ~201 M COP.

## Consecuencias

- **Positivas:** modelo más preciso y, sobre todo, **estable al crecer el
  dataset**; el test de calidad deja de ser intermitente. Se añadió un test de
  regresión (`test_filtro_iqr_elimina_outliers_absurdos`) que fija el
  comportamiento del filtro.
- **Negativas / costo:** el filtro IQR descarta ~13 % de las filas (más que el
  anterior), reduciendo el set de entrenamiento; es un intercambio deliberado
  de cobertura por señal. Los inmuebles descartados igualmente reciben
  `valor_estimado` en la fase de predicción (la limpieza solo afecta el
  entrenamiento).
