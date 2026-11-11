const {
  loginSchema,
  verificarEmailSchema,
  solicitarRecuperacionSchema,
  restablecerPasswordSchema,
  reenviarVerificacionSchema,
} = require('../validators/auth.validator');
const {
  iniciarSesion,
  verificarEmail: verificarEmailService,
  solicitarRecuperacion: solicitarRecuperacionService,
  restablecerPassword: restablecerPasswordService,
  perfilPublico,
} = require('../services/auth.service');
const { reenviarCodigoVerificacion } = require('../services/usuario.service');

function responderDatosInvalidos(res, error) {
  return res.status(400).json({
    error: 'DATOS_INVALIDOS',
    detalles: error.details.map((detalle) => ({
      campo: detalle.path.join('.'),
      mensaje: detalle.message,
    })),
  });
}

async function login(req, res) {
  const validacion = loginSchema.validate(req.body, {
    abortEarly: false,
  });

  if (validacion.error) {
    return responderDatosInvalidos(res, validacion.error);
  }

  const resultado = await iniciarSesion(
    validacion.value.email,
    validacion.value.password,
  );

  return res.status(200).json(resultado);
}

async function verificarEmail(req, res) {
  const validacion = verificarEmailSchema.validate(req.body, {
    abortEarly: false,
  });

  if (validacion.error) {
    return responderDatosInvalidos(res, validacion.error);
  }

  await verificarEmailService(
    validacion.value.email,
    validacion.value.codigo,
  );

  return res.status(200).json({
    mensaje: 'Email verificado correctamente',
  });
}

async function solicitarRecuperacion(req, res) {
  const validacion = solicitarRecuperacionSchema.validate(req.body, {
    abortEarly: false,
  });

  if (validacion.error) {
    return responderDatosInvalidos(res, validacion.error);
  }

  await solicitarRecuperacionService(validacion.value.email);

  return res.status(202).json({
    mensaje:
      'Si el email está registrado, recibirás un enlace para recuperar tu contraseña',
  });
}

async function restablecerPassword(req, res) {
  const validacion = restablecerPasswordSchema.validate(req.body, {
    abortEarly: false,
  });

  if (validacion.error) {
    return responderDatosInvalidos(res, validacion.error);
  }

  await restablecerPasswordService(
    validacion.value.token,
    validacion.value.nuevaPassword,
  );

  return res.status(200).json({
    mensaje: 'Contraseña actualizada correctamente',
  });
}

async function reenviarVerificacion(req, res) {
  const validacion = reenviarVerificacionSchema.validate(req.body, {
    abortEarly: false,
  });

  if (validacion.error) {
    return responderDatosInvalidos(res, validacion.error);
  }

  await reenviarCodigoVerificacion(validacion.value.email);

  return res.status(202).json({
    mensaje:
      'Si la cuenta está pendiente de verificación, te enviamos un código nuevo',
  });
}

function obtenerSesion(req, res) {
  return res.status(200).json({ usuario: perfilPublico(req.usuario) });
}

// El JWT no se guarda en el servidor: cerrar sesión es que el cliente
// descarte el token. El endpoint queda protegido para registrar la acción
// y dejar el punto de extensión (por ejemplo, lista de tokens revocados).
function logout(req, res) {
  return res.status(204).send();
}

module.exports = {
  login,
  logout,
  obtenerSesion,
  reenviarVerificacion,
  verificarEmail,
  solicitarRecuperacion,
  restablecerPassword,
};
