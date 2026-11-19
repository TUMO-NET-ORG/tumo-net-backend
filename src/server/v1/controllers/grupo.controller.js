
const {
  crearGrupoSchema,
  editarGrupoSchema,
  idGrupoSchema,
  listarGruposSchema,
} = require('../validators/grupo.validator');
const {
  listarGrupos: listarGruposService,
  obtenerGrupo: obtenerGrupoService,
  crearGrupo: crearGrupoService,
  editarGrupo: editarGrupoService,
  borrarGrupo: borrarGrupoService,
} = require('../services/grupo.service');
const { responderDatosInvalidos } = require('../utils/respuesta');

// GET /api/v1/grupos?pagina=1&limite=20&buscar=texto
async function listarGrupos(req, res) {
  const validacion = listarGruposSchema.validate(req.query, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (validacion.error) {
    return responderDatosInvalidos(res, validacion.error);
  }

  const resultado = await listarGruposService(validacion.value, req.usuario);
  return res.status(200).json(resultado); // { grupos, paginacion }
}

// GET /api/v1/grupos/:id
async function obtenerGrupo(req, res) {
  const validacionId = idGrupoSchema.validate(req.params);
  if (validacionId.error) {
    return responderDatosInvalidos(res, validacionId.error);
  }

  const grupo = await obtenerGrupoService(validacionId.value.id, req.usuario);
  return res.status(200).json({ grupo });
}

// POST /api/v1/grupos
async function crearGrupo(req, res) {
  const validacion = crearGrupoSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (validacion.error) {
    return responderDatosInvalidos(res, validacion.error);
  }

  const grupo = await crearGrupoService(validacion.value, req.usuario.id);
  return res.status(201).json({ grupo });
}

// PUT /api/v1/grupos/:id
async function editarGrupo(req, res) {
  const validacionId = idGrupoSchema.validate(req.params);
  if (validacionId.error) {
    return responderDatosInvalidos(res, validacionId.error);
  }

  const validacion = editarGrupoSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (validacion.error) {
    return responderDatosInvalidos(res, validacion.error);
  }

  const grupo = await editarGrupoService(validacionId.value.id, validacion.value, req.usuario);
  return res.status(200).json({ grupo });
}

// DELETE /api/v1/grupos/:id
async function borrarGrupo(req, res) {
  const validacionId = idGrupoSchema.validate(req.params);
  if (validacionId.error) {
    return responderDatosInvalidos(res, validacionId.error);
  }

  await borrarGrupoService(validacionId.value.id, req.usuario);
  return res.status(204).send(); 
}

module.exports = { listarGrupos, obtenerGrupo, crearGrupo, editarGrupo, borrarGrupo };