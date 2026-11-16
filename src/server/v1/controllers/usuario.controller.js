const {
  altaUsuarioSchema,
  altaUsuarioAdminSchema,
} = require('../validators/usuario.validator');
const {
  darDeAltaUsuario,
  crearUsuarioPorAdmin,
} = require('../services/usuario.service');

function responderDatosInvalidos(res, error) {
  return res.status(400).json({
    error: 'DATOS_INVALIDOS',
    detalles: error.details.map((detalle) => ({
      campo: detalle.path.join('.'),
      mensaje: detalle.message,
    })),
  });
}

async function crearUsuario(req, res) {
  const validacion = altaUsuarioSchema.validate(req.body, {
    abortEarly: false,
  });

  if (validacion.error) {
    return responderDatosInvalidos(res, validacion.error);
  }

  const resultado = await darDeAltaUsuario(validacion.value);
  return res.status(202).json({ usuario: resultado.usuario });
}

// CU01 (RF1): alta individual por el administrador.
async function crearUsuarioAdmin(req, res) {
  const validacion = altaUsuarioAdminSchema.validate(req.body, {
    abortEarly: false,
  });

  if (validacion.error) {
    return responderDatosInvalidos(res, validacion.error);
  }

  const usuario = await crearUsuarioPorAdmin(validacion.value);
  return res.status(201).json({ usuario });
}

module.exports = { crearUsuario, crearUsuarioAdmin };
