-- rol superadmin, por encima del administrador.
-- Jerarquía: superadmin > administrador > staff > tutor > alumno.


INSERT IGNORE INTO roles (codigo, nombre) VALUES ('superadmin', 'Superadmin');

-- Primer superadmin: solo un superadmin puede asignar ese rol, así que el primero
-- se asigna a mano a un usuario que ya exista y esté activo. Reemplazar el email
-- y ejecutar:
--
-- UPDATE usuarios
--    SET id_rol = (SELECT id FROM roles WHERE codigo = 'superadmin')
--  WHERE email = 'tu.email@tumo.world';

