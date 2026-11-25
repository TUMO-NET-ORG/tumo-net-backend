
const Joi = require('joi');


const listaDeIds = Joi.array()
  .items(Joi.number().integer().positive())
  .unique()
  .messages({ 'array.unique': 'Hay un usuario repetido en {#label}' });

const listaDeResponsables = listaDeIds
  .min(1)
  .messages({ 'array.min': 'El grupo necesita al menos un responsable' });

const grupoSchema = Joi.object({
  nombre: Joi.string().trim().min(3).max(100).required(),
  descripcion: Joi.string().trim().max(500).allow('', null),
  responsables: listaDeResponsables.required()
    .min(1)
    .required()
    .messages({ 'array.min': 'El grupo necesita al menos un responsable' }),
  integrantes: listaDeIds.default([]), 
});

//Responsables no son requeridos porque si no se asignan, el responsable por defecto es quien lo crea.
const crearGrupoSchema = grupoSchema.keys({
  responsables: listaDeResponsables, 
});

const idGrupoSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});

const listarGruposSchema = Joi.object({
  pagina: Joi.number().integer().min(1).default(1),
  limite: Joi.number().integer().min(1).max(100).default(20), 
  buscar: Joi.string().trim().max(100).allow(''),
});

module.exports = {
  crearGrupoSchema,
  editarGrupoSchema: grupoSchema,
  idGrupoSchema,
  listarGruposSchema,
};