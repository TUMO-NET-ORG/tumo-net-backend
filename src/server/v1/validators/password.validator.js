const Joi = require('joi');

// RNF07: mínimo 10 caracteres. Se exige además al menos una letra y un número.
const LARGO_MINIMO_PASSWORD = 10;
const LARGO_MAXIMO_PASSWORD = 128;
const MENSAJE_PASSWORD = `La contraseña debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres, una letra y un número`;

const passwordSchema = Joi.string()
  .min(LARGO_MINIMO_PASSWORD)
  .max(LARGO_MAXIMO_PASSWORD)
  .pattern(/[a-zA-ZáéíóúñÁÉÍÓÚÑ]/, 'letra')
  .pattern(/\d/, 'número')
  .messages({
    'string.base': MENSAJE_PASSWORD,
    'string.empty': 'La contraseña es obligatoria',
    'string.min': MENSAJE_PASSWORD,
    'string.max': `La contraseña no puede tener más de ${LARGO_MAXIMO_PASSWORD} caracteres`,
    'string.pattern.name': MENSAJE_PASSWORD,
  });

module.exports = { passwordSchema, LARGO_MINIMO_PASSWORD };
