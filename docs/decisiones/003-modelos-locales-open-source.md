# ADR 003 — Modelos locales de código abierto (sin IA generativa de pago)

- **Estado:** Aceptada
- **Fecha:** 2026-06 (vigente al cierre de Fase 8)

## Contexto

El MVP debe correr completo en una sola máquina (WSL2), sin costos recurrentes
por petición y sin enviar datos a terceros. Las tareas analíticas son de
naturaleza tabular/geoespacial (regresión de precio, segmentación,
clasificación de oportunidad, optimización multiobjetivo, explicabilidad), no
de lenguaje natural.

## Decisión

Usar exclusivamente **modelos locales de código abierto**, sin IA generativa de
pago en el camino crítico:

- **Valor de mercado:** XGBoost (selección entre 4 modelos por RMSE), objetivo
  en espacio logarítmico.
- **Segmentación:** StandardScaler → PCA → K-means (k por silueta).
- **Oportunidad:** StandardScaler → regresión logística balanceada.
- **Optimización de portafolio:** NSGA-II (pymoo).
- **Explicabilidad:** SHAP (TreeExplainer).

Los artefactos entrenados se serializan con joblib en un volumen Docker. Una
capa opcional de Claude API para reportes en lenguaje natural queda registrada
como **mejora futura**, fuera del MVP.

## Consecuencias

- **Positivas:** costo marginal cero por análisis, datos que no salen de la
  máquina, reproducibilidad total (entrenamiento determinista, `n_jobs=1`,
  semillas fijas) y dependencia nula de servicios externos para operar.
- **Negativas / costo:** el equipo asume el ciclo de vida de los modelos
  (entrenamiento, validación, recálculo) y la calidad depende de datos de
  anuncios ruidosos. En Fase 8 esto motivó robustecer el filtrado de outliers
  y medir la calidad con R² validada por CV en lugar de un único split (ver
  ADR 004). Las explicaciones son cuantitativas (SHAP), no narrativas.
