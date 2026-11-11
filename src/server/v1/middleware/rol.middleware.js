const AppError = require('../errors/AppError');

// RF8: restringe una ruta a ciertos roles. Usar después de `autenticar`.
// Ejemplo: router.get('/usuarios', autenticar, requerirRol('administrador'), ...)
function requerirRol(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.usuario) {
      return next(
        new AppError(401, 'Se requiere iniciar sesión', 'TOKEN_NO_PROVISTO'),
      );
    }

    if (!rolesPermitidos.includes(req.usuario.rol)) {
      return next(
        new AppError(
          403,
          'No tenés permisos para realizar esta acción',
          'SIN_PERMISO',
        ),
      );
    }

    return next();
  };
}

module.exports = { requerirRol };
