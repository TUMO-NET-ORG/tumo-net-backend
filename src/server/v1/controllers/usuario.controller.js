const { responderDatosInvalidos } = require('../utils/respuesta');

const {
  altaUsuarioSchema,
  altaUsuarioAdminSchema,
  editarUsuarioSchema,
  idUsuarioSchema,
  listarUsuariosSchema,
  cambiarEstadoSchema,
} = require('../validators/usuario.validator');
const {
  darDeAltaUsuario,
  crearUsuarioPorAdmin,
  editarUsuarioPorAdmin,
  obtenerUsuarioPorAdmin,
  listarUsuarios,
  solicitarCambioEmailPorAdmin,
  cambiarEstadoPorAdmin,
  restablecerPasswordPorAdmin,
} = require('../services/usuario.service');



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
  return res.status(202).json({ usuario });
}

// Consulta individual para la pantalla de edición del administrador.
async function obtenerUsuarioAdmin(req, res) {
  const validacionId = idUsuarioSchema.validate(req.params.id);

  if (validacionId.error) {
    return responderIdInvalido(res, validacionId.error);
  }

  const usuario = await obtenerUsuarioPorAdmin(validacionId.value);
  return res.status(200).json({ usuario });
}

function responderIdInvalido(res, error) {
  return res.status(400).json({
    error: 'DATOS_INVALIDOS',
    detalles: [{ campo: 'id', mensaje: error.message }],
  });
}

// CU01 (RF1): edición de datos por el administrador.
async function editarUsuarioAdmin(req, res) {
  const validacionId = idUsuarioSchema.validate(req.params.id);

  if (validacionId.error) {
    return responderIdInvalido(res, validacionId.error);
  }

  const validacion = editarUsuarioSchema.validate(req.body ?? {}, {
    abortEarly: false,
  });

  if (validacion.error) {
    return responderDatosInvalidos(res, validacion.error);
  }

  const usuario = await editarUsuarioPorAdmin(
    validacionId.value,
    validacion.value,
    req.usuario,
  );
  return res.status(200).json({ usuario });
}

async function solicitarCambioEmailAdmin(req, res) {
  const validacionId = idUsuarioSchema.validate(req.params.id);
  if (validacionId.error) {
    return responderIdInvalido(res, validacionId.error);
  }

  const { emailSchema } = require('../validators/email.validator');
  const validacion = emailSchema.validate(req.body?.email);
  if (validacion.error) {
    return responderDatosInvalidos(res, validacion.error);
  }

  const resultado = await solicitarCambioEmailPorAdmin(
    validacionId.value,
    validacion.value,
  );
  return res.status(202).json(resultado);
}

// CU01 (flujo principal, paso 2): listado con búsqueda, filtros y paginación.
async function listarUsuariosAdmin(req, res) {
  const validacion = listarUsuariosSchema.validate(req.query, {
    abortEarly: false,
  });

  if (validacion.error) {
    return responderDatosInvalidos(res, validacion.error);
  }

  const resultado = await listarUsuarios(validacion.value);
  return res.status(200).json(resultado);
}

// CU01 (flujo 3.b): cambio de estado por el administrador.
async function cambiarEstadoAdmin(req, res) {
  const validacionId = idUsuarioSchema.validate(req.params.id);

  if (validacionId.error) {
    return responderIdInvalido(res, validacionId.error);
  }

  const validacion = cambiarEstadoSchema.validate(req.body ?? {}, {
    abortEarly: false,
  });

  if (validacion.error) {
    return responderDatosInvalidos(res, validacion.error);
  }

  const usuario = await cambiarEstadoPorAdmin(
    validacionId.value,
    validacion.value.estado,
    req.usuario,
  );
  return res.status(200).json({ usuario });
}

// CU01 (flujo 3.a, RF4): restablecimiento con contraseña temporal.
async function restablecerPasswordAdmin(req, res) {
  const validacionId = idUsuarioSchema.validate(req.params.id);

  if (validacionId.error) {
    return responderIdInvalido(res, validacionId.error);
  }

  const resultado = await restablecerPasswordPorAdmin(
    validacionId.value,
    req.usuario,
  );

  // La contraseña temporal se muestra una sola vez: que no quede en cachés.
  res.set('Cache-Control', 'no-store');
  return res.status(200).json(resultado);
}

module.exports = {
  cambiarEstadoAdmin,
  restablecerPasswordAdmin,
  crearUsuario,
  crearUsuarioAdmin,
  obtenerUsuarioAdmin,
  editarUsuarioAdmin,
  solicitarCambioEmailAdmin,
  listarUsuariosAdmin,
};
