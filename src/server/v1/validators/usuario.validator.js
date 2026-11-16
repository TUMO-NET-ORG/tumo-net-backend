const Joi = require('joi');
const { emailSchema } = require('./email.validator');
const { passwordSchema } = require('./password.validator');

// Roles definidos en RNF12 (deben coincidir con la tabla `roles`).
const ROLES = ['administrador', 'alumno', 'staff', 'tutor'];

const datosPersonales = {
  nombre: Joi.string().trim().min(1).max(100).required(),
  apellido: Joi.string().trim().min(1).max(100).required(),
  documento: Joi.string().trim().min(1).max(20).required(),
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
};

const altaUsuarioSchema = Joi.object({
  ...datosPersonales,
  aceptaTerminos: Joi.valid(true)
    .required()
    .messages({
      'any.only': 'Es necesario aceptar los términos y condiciones',
    }),
  versionTerminos: Joi.string().trim().min(1).max(20).required(),
});

// CU01 (RF1): alta individual por el administrador. La contraseña es la
// inicial que define el administrador y se valida con la política de RNF07.
const altaUsuarioAdminSchema = Joi.object({
  ...datosPersonales,
  rol: Joi.string()
    .valid(...ROLES)
    .required()
    .messages({
      'any.only': `El rol debe ser uno de: ${ROLES.join(', ')}`,
    }),
});

module.exports = { altaUsuarioSchema, altaUsuarioAdminSchema, ROLES };
