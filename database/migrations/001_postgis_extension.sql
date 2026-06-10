-- 001_postgis_extension.sql
-- Habilita las extensiones espaciales requeridas por DataRaíz.
-- Debe ejecutarse antes de cualquier migración que use tipos GEOMETRY.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
