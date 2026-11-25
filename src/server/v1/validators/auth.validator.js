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
  aceptaTerminos: Joi.boolean().default(false),
  versionTerminos: Joi.string().trim().min(1).max(20).default('1.0'),
});

const tokenInfoSchema = Joi.object({
  token: Joi.string().trim().min(32).max(256).required(),
});

const cambiarPasswordSchema = Joi.object({
  passwordActual: Joi.string().min(1).max(128).required(),
  nuevaPassword: passwordSchema.required(),
});

module.exports = {
  cambiarPasswordSchema,
  loginSchema,
  verificarEmailSchema,
  solicitarRecuperacionSchema,
  reenviarVerificacionSchema,
  restablecerPasswordSchema,
  tokenInfoSchema,
};
