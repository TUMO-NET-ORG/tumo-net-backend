-- CU01 (RF1, RF2, RNF15): la baja lógica es un estado más del usuario.
-- Solo para bases creadas ANTES de que este estado se agregara a
-- "sql script.sql". Se puede ejecutar más de una vez sin duplicar la fila.

INSERT INTO estado_usuario (codigo, nombre)
SELECT 'dado_de_baja', 'Dado de baja'
WHERE NOT EXISTS (
  SELECT 1 FROM estado_usuario WHERE codigo = 'dado_de_baja'
);
