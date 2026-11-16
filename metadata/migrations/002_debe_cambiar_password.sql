-- CU01: las cuentas creadas por el administrador deben cambiar la contraseña
-- inicial en su primer ingreso. Solo para bases creadas ANTES de que esta
-- columna se agregara a "sql script.sql". Verificar con:
-- SHOW COLUMNS FROM usuarios LIKE 'debe_cambiar_password';

ALTER TABLE usuarios
  ADD COLUMN debe_cambiar_password TINYINT NOT NULL DEFAULT 0;
