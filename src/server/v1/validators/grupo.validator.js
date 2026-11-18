
const Joi = require('joi');


const listaDeIds = Joi.array()
  .items(Joi.number().integer().positive())
  .unique()
  .messages({ 'array.unique': 'Hay un usuario repetido en {#label}' });

const crearGrupoSchema = Joi.object({
  nombre: Joi.string().trim().min(3).max(100).required(),
  descripcion: Joi.string().trim().max(500).allow('', null),
  responsables: listaDeIds
    .min(1)
    .required()
    .messages({ 'array.min': 'El grupo necesita al menos un responsable' }),
  integrantes: listaDeIds.default([]), 
});

module.exports = { crearGrupoSchema };