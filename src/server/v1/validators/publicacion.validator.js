const Joi = require('joi');

const crearPublicacionSchema = Joi.object({
  texto: Joi.string().trim().min(1).max(5000).required(),
  enlace_url: Joi.string().trim().uri({ scheme: ['http', 'https'] }).max(500).allow('', null),
  disciplina_id: Joi.number().integer().positive().required(),
});

const idPublicacionSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});

const listarPublicacionesSchema = Joi.object({
  pagina: Joi.number().integer().min(1).default(1),
  limite: Joi.number().integer().min(1).max(100).default(20),
  disciplina: Joi.string().trim().max(30).allow('', null),
});

module.exports = {
  crearPublicacionSchema,
  idPublicacionSchema,
  listarPublicacionesSchema,
};
