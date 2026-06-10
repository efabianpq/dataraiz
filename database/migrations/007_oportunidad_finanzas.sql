-- 007_oportunidad_finanzas.sql
-- Fase 5 — Oportunidad y finanzas.
-- Agrega los campos que produce el pipeline
-- analytics/app/pipelines/oportunidad_finanzas.py:
--   * analisis_inmueble.prob_oportunidad        → probabilidad (0-1) del clasificador
--                                                  logístico de oportunidad
--   * analisis_inmueble.canon_estimado_mensual  → arriendo mensual estimado (COP)
--   * analisis_inmueble.yield_bruto             → (canon*12)/precio*100, %
--   * analisis_inmueble.cap_rate                → yield_bruto * 0.85, %
-- Idempotente (IF NOT EXISTS) para poder aplicarse sobre una DB ya inicializada.

ALTER TABLE analisis_inmueble
    ADD COLUMN IF NOT EXISTS prob_oportunidad       NUMERIC(5, 4),
    ADD COLUMN IF NOT EXISTS canon_estimado_mensual NUMERIC(14, 2),
    ADD COLUMN IF NOT EXISTS yield_bruto            NUMERIC(6, 3),
    ADD COLUMN IF NOT EXISTS cap_rate               NUMERIC(6, 3);

ALTER TABLE analisis_inmueble
    DROP CONSTRAINT IF EXISTS analisis_inmueble_prob_oportunidad_chk;
ALTER TABLE analisis_inmueble
    ADD CONSTRAINT analisis_inmueble_prob_oportunidad_chk
    CHECK (prob_oportunidad IS NULL
           OR prob_oportunidad BETWEEN 0 AND 1);
