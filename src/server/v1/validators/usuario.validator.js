const Joi = require('joi');
const { emailSchema } = require('./email.validator');
const { passwordSchema } = require('./password.validator');
const { cedulaSchema } = require('./cedula.validator'); 

const altaUsuarioSchema = Joi.object({
  nombre: Joi.string().trim().min(1).max(100).required(),
  apellido: Joi.string().trim().min(1).max(100).required(),
  documento: cedulaSchema.required(),
  email: emailSchema.required(),
  password: passwordSchema.required(),
  fechaNacimiento: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .allow(null)
    .optional()
    .messages({
      'string.pattern.base': 'debe tener formato YYYY-MM-DD',
    }),
  fotoUrl: Joi.string().trim().uri().max(500).allow(null).optional(),
  urlPortfolio: Joi.string().trim().uri().max(500).allow(null).optional(),
  aceptaTerminos: Joi.valid(true)
    .required()
    .messages({
      'any.only': 'Es necesario aceptar los términos y condiciones',
    }),
  versionTerminos: Joi.string().trim().min(1).max(20).required(),
});

module.exports = { altaUsuarioSchema };
