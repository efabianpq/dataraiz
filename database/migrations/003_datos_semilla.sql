-- 003_datos_semilla.sql
-- Datos de prueba mínimos para desarrollo: zonas (municipios) del área
-- piloto, como bounding boxes provisionales. Se refinarán con los
-- polígonos oficiales del POT en la Fase 1B.

INSERT INTO zona (nombre, municipio, geom) VALUES
    ('Bucaramanga', 'Bucaramanga',
     ST_Multi(ST_MakeEnvelope(-73.1700, 7.0500, -73.0700, 7.1800, 4326))),
    ('Floridablanca', 'Floridablanca',
     ST_Multi(ST_MakeEnvelope(-73.1300, 7.0000, -73.0700, 7.1000, 4326))),
    ('Girón', 'Girón',
     ST_Multi(ST_MakeEnvelope(-73.2200, 7.0300, -73.1300, 7.1300, 4326))),
    ('Piedecuesta', 'Piedecuesta',
     ST_Multi(ST_MakeEnvelope(-73.1100, 6.9500, -73.0000, 7.0600, 4326)));
