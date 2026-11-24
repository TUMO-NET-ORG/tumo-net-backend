-- Grupos: un usuario dado de baja no puede estar en ningún grupo.
-- Desde este cambio, al dar de baja a un usuario se lo saca de sus grupos.
-- Esta migración limpia a los que se dieron de baja antes y siguen en algún grupo.
-- Verificar antes con:
-- SELECT gi.* FROM grupo_integrantes gi
--   JOIN usuarios u ON u.id = gi.usuario_id
--   JOIN estado_usuario e ON e.id = u.id_estado
--  WHERE e.codigo = 'dado_de_baja';

DELETE gi
  FROM grupo_integrantes gi
  JOIN usuarios u ON u.id = gi.usuario_id
  JOIN estado_usuario e ON e.id = u.id_estado
 WHERE e.codigo = 'dado_de_baja';
