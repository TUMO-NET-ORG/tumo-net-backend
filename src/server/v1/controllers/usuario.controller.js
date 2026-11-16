const {
  altaUsuarioSchema,
  altaUsuarioAdminSchema,
  editarUsuarioSchema,
  idUsuarioSchema,
  listarUsuariosSchema,
} = require('../validators/usuario.validator');
const {
  darDeAltaUsuario,
  crearUsuarioPorAdmin,
  editarUsuarioPorAdmin,
  listarUsuarios,
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

// CU01 (RF1): edición de datos por el administrador.
async function editarUsuarioAdmin(req, res) {
  const validacionId = idUsuarioSchema.validate(req.params.id);

  if (validacionId.error) {
    return res.status(400).json({
      error: 'DATOS_INVALIDOS',
      detalles: [{ campo: 'id', mensaje: validacionId.error.message }],
    });
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

module.exports = {
  crearUsuario,
  crearUsuarioAdmin,
  editarUsuarioAdmin,
  listarUsuariosAdmin,
};
