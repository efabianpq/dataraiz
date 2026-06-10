-- 005_brecha_precision.sql
-- Fase 3 — Modelos de valor.
-- Amplía la precisión de analisis_inmueble.brecha: con inmuebles atípicos
-- (precio muy alto vs. valor estimado) la brecha porcentual puede superar el
-- límite de NUMERIC(8,3) (99 999.999) y provocar overflow al persistir.
-- NUMERIC(12,2) admite hasta ~10 000 millones %, holgado para cualquier caso.

ALTER TABLE analisis_inmueble
    ALTER COLUMN brecha TYPE NUMERIC(12, 2);
