const Joi = require('joi');

// RNF07: mínimo 10 caracteres. Se exige además al menos un número.
const LARGO_MINIMO_PASSWORD = 10;
const MENSAJE_PASSWORD = `La contraseña debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres y un número`;

const passwordSchema = Joi.string()
  .min(LARGO_MINIMO_PASSWORD)
  .max(128)
  .pattern(/\d/)
  .messages({
    'string.min': MENSAJE_PASSWORD,
    'string.pattern.base': MENSAJE_PASSWORD,
  });

module.exports = { passwordSchema, LARGO_MINIMO_PASSWORD };
