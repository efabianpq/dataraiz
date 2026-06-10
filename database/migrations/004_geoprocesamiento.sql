-- 004_geoprocesamiento.sql
-- Fase 2 — Geoprocesamiento.
-- 1. Registra el SRID 9377 (MAGNA-SIRGAS 2018 / Origen-Nacional) en
--    spatial_ref_sys: PostGIS 3.4 trae el antiguo 3116 (zona Bogotá) pero no
--    el 9377 nacional, por lo que ST_Transform(geom, 9377) falla sin esto.
-- 2. Agrega a analisis_inmueble las variables de contexto espacial.
-- 3. Asegura los índices espaciales GIST (idempotente) y un índice por zona.

-- ============================================================
-- 1. SRID 9377 — MAGNA-SIRGAS 2018 / Origen-Nacional (Transverse Mercator)
--    lat_0=4, lon_0=-73, k=0.9992, x_0=5e6, y_0=2e6, elipsoide GRS80.
-- ============================================================
INSERT INTO spatial_ref_sys (srid, auth_name, auth_srid, proj4text, srtext)
VALUES (
    9377,
    'EPSG',
    9377,
    '+proj=tmerc +lat_0=4 +lon_0=-73 +k=0.9992 +x_0=5000000 +y_0=2000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    'PROJCS["MAGNA-SIRGAS 2018 / Origen-Nacional",GEOGCS["MAGNA-SIRGAS 2018",DATUM["MAGNA-SIRGAS_2018",SPHEROID["GRS 1980",6378137,298.257222101,AUTHORITY["EPSG","7019"]],AUTHORITY["EPSG","1318"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199432955,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","20046"]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",4],PARAMETER["central_meridian",-73],PARAMETER["scale_factor",0.9992],PARAMETER["false_easting",5000000],PARAMETER["false_northing",2000000],UNIT["metre",1,AUTHORITY["EPSG","9001"]],AXIS["Northing",NORTH],AXIS["Easting",EAST],AUTHORITY["EPSG","9377"]]'
)
ON CONFLICT (srid) DO NOTHING;

-- ============================================================
-- 2. Variables de contexto espacial en analisis_inmueble
-- ============================================================
ALTER TABLE analisis_inmueble
    ADD COLUMN IF NOT EXISTS dist_pot_m          NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS en_zona_riesgo      BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS nivel_riesgo        VARCHAR(20)
        CONSTRAINT analisis_inmueble_nivel_riesgo_chk
        CHECK (nivel_riesgo IN ('bajo', 'medio', 'alto')),
    ADD COLUMN IF NOT EXISTS dist_centrocentro_m NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS zona_id             INTEGER REFERENCES zona (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_analisis_inmueble_zona ON analisis_inmueble (zona_id);

-- ============================================================
-- 3. Índices espaciales GIST (ya creados en 002; IF NOT EXISTS por idempotencia)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_inmueble_geom     ON inmueble     USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_zona_geom         ON zona         USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_proyecto_pot_geom ON proyecto_pot USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_capa_riesgo_geom  ON capa_riesgo  USING GIST (geom);
