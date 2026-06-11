-- 009_usuario_admin.sql
-- Fase 7 — Aplicación (API + Dashboard).
-- Siembra el único usuario administrador del MVP. La autenticación real es por
-- JWT contra la variable de entorno ADMIN_PASSWORD del backend (no multi-tenant);
-- esta fila existe para satisfacer las llaves foráneas usuario_id de `watchlist`
-- y `alerta`. El password_hash es un placeholder y NO se usa para login.
-- Idempotente: ON CONFLICT sobre el email único.

INSERT INTO usuario (id, nombre, email, password_hash, preferencias)
VALUES (1, 'Administrador DataRaíz', 'admin@dataraiz.local', 'env:ADMIN_PASSWORD', '{}'::jsonb)
ON CONFLICT (email) DO NOTHING;

-- Asegura que la secuencia del serial no choque con el id=1 insertado a mano.
SELECT setval(pg_get_serial_sequence('usuario', 'id'), GREATEST((SELECT MAX(id) FROM usuario), 1));
