const {
  crearPublicacionSchema,
  listarPublicacionesSchema,
} = require('../validators/publicacion.validator');
const publicacionService = require('../services/publicacion.service');
const { responderDatosInvalidos } = require('../utils/respuesta');

async function listarDisciplinas(req, res) {
  const disciplinas = await publicacionService.listarDisciplinas();
  return res.status(200).json({ disciplinas });
}

async function listarPublicaciones(req, res) {
  const validacion = listarPublicacionesSchema.validate(req.query, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (validacion.error) {
    return responderDatosInvalidos(res, validacion.error);
  }
  const resultado = await publicacionService.listarPublicaciones(validacion.value);
  return res.status(200).json(resultado);
}

async function crearPublicacion(req, res) {
  const validacion = crearPublicacionSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (validacion.error) {
    return responderDatosInvalidos(res, validacion.error);
  }

  const publicacion = await publicacionService.crearPublicacion(
    validacion.value,
    req.usuario.id,
    req.files || [],
  );
  return res.status(201).json({ publicacion });
}

module.exports = { listarDisciplinas, listarPublicaciones, crearPublicacion };
