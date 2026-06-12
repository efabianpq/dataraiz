# ADR 001 — Resultados precalculados en PostgreSQL; el backend solo lee

- **Estado:** Aceptada
- **Fecha:** 2026-06 (vigente al cierre de Fase 8)

## Contexto

El sistema produce, por inmueble, varias salidas costosas: variables
espaciales (PostGIS), valor estimado (XGBoost), segmento (K-means),
comparables, probabilidad de oportunidad (regresión logística), indicadores
financieros, score integrado y explicaciones SHAP. El dashboard necesita
listar, filtrar y abrir fichas con baja latencia, y debe servir un set amplio
(hasta 1000 puntos) para alimentar el mapa.

Recalcular cualquiera de esas salidas en cada petición HTTP sería lento, no
determinista entre peticiones y acoplaría la API al entorno Python de ML.

## Decisión

El **motor analytics (Python/FastAPI) precalcula todo y lo persiste** en la
tabla `analisis_inmueble` (y `comparable`). El **backend (NestJS) solo lee**
esos resultados con SQL crudo; su única escritura es el estado del usuario
(watchlist y alerta). La frontera es explícita: analytics escribe el análisis,
el backend lo sirve.

La única excepción es el frente de Pareto (NSGA-II), que depende de criterios
del usuario y no se puede precalcular: el backend lo delega bajo demanda al
motor analytics vía `POST /api/optimizar`.

## Consecuencias

- **Positivas:** lecturas muy rápidas (listado/ficha < 15 ms con el dataset del
  piloto), reproducibilidad (todos ven el mismo número precalculado), y un
  backend simple sin dependencias de ML. El recálculo es un proceso por lotes
  controlado (ver el pipeline en el README), no un efecto secundario de una
  petición.
- **Negativas / costo:** los resultados pueden quedar **desactualizados** tras
  un scraping si no se recorre la cadena de análisis. En la Fase 8 esto se
  observó (el dataset creció de 502 a 700 inmuebles con análisis viejo) y se
  resolvió re-ejecutando el pipeline. Conviene automatizar el recálculo tras
  cada scraping en una iteración futura.
