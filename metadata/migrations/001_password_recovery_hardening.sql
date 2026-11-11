-- Migración solo para bases creadas ANTES de que estas columnas se agregaran
-- a "sql script.sql". Si la base se creó con la versión actual del script,
-- NO ejecutar: las columnas ya existen y MySQL devuelve "Duplicate column".
-- Verificar con: SHOW COLUMNS FROM usuarios LIKE 'password_version';

ALTER TABLE usuarios
  ADD COLUMN password_version INT UNSIGNED NOT NULL DEFAULT 0;

ALTER TABLE token_recuperacion
  ADD COLUMN fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN fecha_uso DATETIME NULL,
  ADD INDEX idx_token_recuperacion_usuario_fecha (usuario_id, fecha_creacion);
