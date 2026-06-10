-- 002_schema_inicial.sql
-- Esquema inicial de DataRaíz: entidades principales descritas en CLAUDE.md.
-- Geometrías en SRID 4326 (WGS84). Para distancias en metros usar
-- ST_Transform(geom, 9377) (MAGNA-SIRGAS / Colombia Bogotá zone).

-- ============================================================
-- inmueble: anuncio capturado y normalizado
-- ============================================================
CREATE TABLE inmueble (
    id            SERIAL PRIMARY KEY,
    fuente        VARCHAR(50) NOT NULL,
    url_anuncio   TEXT UNIQUE,
    tipo          VARCHAR(30) NOT NULL CHECK (tipo IN ('apto', 'casa', 'lote', 'local')),
    precio        NUMERIC(14, 2),
    area_m2       NUMERIC(10, 2),
    habitaciones  SMALLINT,
    banos         SMALLINT,
    direccion     TEXT,
    descripcion   TEXT,
    geom          GEOMETRY(Point, 4326),
    fecha_captura TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inmueble_geom ON inmueble USING GIST (geom);
CREATE INDEX idx_inmueble_tipo ON inmueble (tipo);

-- ============================================================
-- zona: unidad territorial (barrio/sector/municipio)
-- ============================================================
CREATE TABLE zona (
    id                 SERIAL PRIMARY KEY,
    nombre             VARCHAR(100) NOT NULL,
    municipio          VARCHAR(50),
    geom               GEOMETRY(MultiPolygon, 4326),
    precio_m2_mediano  NUMERIC(14, 2),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_zona_geom ON zona USING GIST (geom);

-- ============================================================
-- proyecto_pot: proyectos de infraestructura y POT
-- ============================================================
CREATE TABLE proyecto_pot (
    id          SERIAL PRIMARY KEY,
    nombre      VARCHAR(150),
    tipo        VARCHAR(50) NOT NULL,
    estado      VARCHAR(30),
    geom        GEOMETRY(Geometry, 4326) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_proyecto_pot_geom ON proyecto_pot USING GIST (geom);

-- ============================================================
-- capa_riesgo: polígonos de amenaza/riesgo
-- ============================================================
CREATE TABLE capa_riesgo (
    id          SERIAL PRIMARY KEY,
    categoria   VARCHAR(50) NOT NULL,
    nivel       VARCHAR(20) CHECK (nivel IN ('bajo', 'medio', 'alto')),
    geom        GEOMETRY(MultiPolygon, 4326) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_capa_riesgo_geom ON capa_riesgo USING GIST (geom);

-- ============================================================
-- usuario: inversionista registrado
-- ============================================================
CREATE TABLE usuario (
    id             SERIAL PRIMARY KEY,
    nombre         VARCHAR(100) NOT NULL,
    email          VARCHAR(150) UNIQUE NOT NULL,
    password_hash  TEXT NOT NULL,
    preferencias   JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- analisis_inmueble: resultados precalculados por inmueble
-- ============================================================
CREATE TABLE analisis_inmueble (
    id              SERIAL PRIMARY KEY,
    inmueble_id     INTEGER NOT NULL UNIQUE REFERENCES inmueble (id) ON DELETE CASCADE,
    valor_estimado  NUMERIC(14, 2),
    brecha          NUMERIC(8, 3),
    score           NUMERIC(5, 2),
    shap_json       JSONB,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- comparable: relación de un inmueble con sus comparables
-- ============================================================
CREATE TABLE comparable (
    id             SERIAL PRIMARY KEY,
    inmueble_id    INTEGER NOT NULL REFERENCES inmueble (id) ON DELETE CASCADE,
    comparable_id  INTEGER NOT NULL REFERENCES inmueble (id) ON DELETE CASCADE,
    distancia      NUMERIC(10, 3),
    dif_precio_m2  NUMERIC(14, 2),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT comparable_distinto CHECK (inmueble_id <> comparable_id),
    CONSTRAINT comparable_unico UNIQUE (inmueble_id, comparable_id)
);

CREATE INDEX idx_comparable_inmueble ON comparable (inmueble_id);

-- ============================================================
-- watchlist: criterios de búsqueda guardados por el usuario
-- ============================================================
CREATE TABLE watchlist (
    id            SERIAL PRIMARY KEY,
    usuario_id    INTEGER NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
    nombre        VARCHAR(100),
    filtros_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
    activa        BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_watchlist_usuario ON watchlist (usuario_id);

-- ============================================================
-- alerta: notificaciones generadas para el usuario
-- ============================================================
CREATE TABLE alerta (
    id           SERIAL PRIMARY KEY,
    usuario_id   INTEGER NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
    inmueble_id  INTEGER NOT NULL REFERENCES inmueble (id) ON DELETE CASCADE,
    fecha        TIMESTAMPTZ NOT NULL DEFAULT now(),
    estado       VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'vista'))
);

CREATE INDEX idx_alerta_usuario ON alerta (usuario_id);
