const Joi = require('joi');
const { emailSchema } = require('./email.validator');
const { passwordSchema } = require('./password.validator');

const loginSchema = Joi.object({
  email: emailSchema.required(),
  password: Joi.string().min(1).max(128).required(),
});

const verificarEmailSchema = Joi.object({
  email: emailSchema.required(),
  codigo: Joi.string()
    .pattern(/^\d{6}$/)
    .required()
    .messages({
      'string.pattern.base': 'El código debe tener 6 dígitos',
    }),
});

const solicitarRecuperacionSchema = Joi.object({
  email: emailSchema.required(),
});

const reenviarVerificacionSchema = Joi.object({
  email: emailSchema.required(),
});

const restablecerPasswordSchema = Joi.object({
  token: Joi.string().trim().min(32).max(256).required(),
  nuevaPassword: passwordSchema.required(),
});

module.exports = {
  loginSchema,
  verificarEmailSchema,
  solicitarRecuperacionSchema,
  reenviarVerificacionSchema,
  restablecerPasswordSchema,
};
