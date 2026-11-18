-- Grupos: baja lógica. Un grupo borrado queda con activo = 0 y deja de
-- aparecer, pero el registro no se elimina.
-- Solo para bases que ya aplicaron 004_grupos.sql antes de que esta columna
-- se agregara a "sql script.sql". Verificar con:
-- SHOW COLUMNS FROM grupos LIKE 'activo';

ALTER TABLE grupos
  ADD COLUMN activo TINYINT NOT NULL DEFAULT 1;
