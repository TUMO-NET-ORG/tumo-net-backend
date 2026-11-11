const jwt = require('jsonwebtoken');
const AppError = require('../errors/AppError');
const { validarUsuarioToken } = require('../services/auth.service');

async function autenticar(req, res, next) {
  const authorization = req.headers.authorization;
  const [tipo, token] = authorization ? authorization.split(' ') : [];

  if (tipo !== 'Bearer' || !token) {
    return next(
      new AppError(
        401,
        'Se requiere un token Bearer',
        'TOKEN_NO_PROVISTO',
      ),
    );
  }

  if (!process.env.JWT_SECRET) {
    return next(
      new AppError(
        500,
        'La configuración JWT está incompleta',
        'CONFIGURACION_JWT_INCOMPLETA',
      ),
    );
  }

  let payload;

  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return next(
      new AppError(
        401,
        'El token no es válido o expiró',
        'TOKEN_INVALIDO',
      ),
    );
  }

  try {
    req.usuario = await validarUsuarioToken(
      Number(payload.sub),
      Number(payload.passwordVersion),
    );
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { autenticar };
