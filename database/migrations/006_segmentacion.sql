-- 006_segmentacion.sql
-- Fase 4 — Segmentación y comparables.
-- Agrega los campos que produce el pipeline analytics/app/pipelines/segmentacion.py:
--   * analisis_inmueble.segmento             → cluster K-means asignado al inmueble
--   * analisis_inmueble.posicion_vs_mediana  → 'debajo'/'encima' del precio_m2 mediano
--                                              de sus comparables (potencial oportunidad)
--   * comparable.distancia_pca               → distancia euclidiana en espacio PCA
--   * comparable.posicion_vs_mediana         → posición del comparable respecto a la
--                                              mediana de precio_m2 del conjunto de comps
-- Idempotente (IF NOT EXISTS) para poder aplicarse sobre una DB ya inicializada.

ALTER TABLE analisis_inmueble
    ADD COLUMN IF NOT EXISTS segmento            INTEGER,
    ADD COLUMN IF NOT EXISTS posicion_vs_mediana VARCHAR(10);

ALTER TABLE analisis_inmueble
    DROP CONSTRAINT IF EXISTS analisis_inmueble_posicion_chk;
ALTER TABLE analisis_inmueble
    ADD CONSTRAINT analisis_inmueble_posicion_chk
    CHECK (posicion_vs_mediana IS NULL
           OR posicion_vs_mediana IN ('encima', 'debajo'));

CREATE INDEX IF NOT EXISTS idx_analisis_inmueble_segmento
    ON analisis_inmueble (segmento);

ALTER TABLE comparable
    ADD COLUMN IF NOT EXISTS distancia_pca       NUMERIC(12, 6),
    ADD COLUMN IF NOT EXISTS posicion_vs_mediana VARCHAR(10);

ALTER TABLE comparable
    DROP CONSTRAINT IF EXISTS comparable_posicion_chk;
ALTER TABLE comparable
    ADD CONSTRAINT comparable_posicion_chk
    CHECK (posicion_vs_mediana IS NULL
           OR posicion_vs_mediana IN ('encima', 'debajo'));
