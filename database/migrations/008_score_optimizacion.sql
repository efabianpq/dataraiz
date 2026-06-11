-- 008_score_optimizacion.sql
-- Fase 6 — Score integrado, explicabilidad (SHAP) y optimización (NSGA-II).
-- Las columnas analisis_inmueble.score (NUMERIC(5,2)) y shap_json (JSONB) ya
-- existen desde 002_schema_inicial.sql; esta migración solo refuerza el rango
-- válido del score que produce analytics/app/pipelines/scoring.py:
--   * analisis_inmueble.score      → 0-100 (NULL para los atípicos seg. 2-3)
--   * analisis_inmueble.shap_json  → lista de contribuciones SHAP por feature
-- Idempotente para poder aplicarse sobre una DB ya inicializada.

ALTER TABLE analisis_inmueble
    DROP CONSTRAINT IF EXISTS analisis_inmueble_score_chk;
ALTER TABLE analisis_inmueble
    ADD CONSTRAINT analisis_inmueble_score_chk
    CHECK (score IS NULL OR score BETWEEN 0 AND 100);
