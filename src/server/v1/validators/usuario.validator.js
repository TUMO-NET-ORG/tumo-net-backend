const Joi = require('joi');
const { emailSchema } = require('./email.validator');
const { passwordSchema } = require('./password.validator');
const { cedulaSchema } = require('./cedula.validator'); 

// Roles definidos en RNF12 (deben coincidir con la tabla `roles`).
const ROLES = ['administrador', 'alumno', 'staff', 'tutor'];

const datosPersonales = {
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

// CU01 (RF1): edición por el administrador. Body parcial (al menos un campo).
// La contraseña no se cambia por acá (ver restablecimiento) ni el estado.
const editarUsuarioSchema = altaUsuarioAdminSchema
  .fork(['nombre', 'apellido', 'documento', 'email', 'rol'], (campo) =>
    campo.optional(),
  )
  .keys({
    password: Joi.forbidden().messages({
      'any.unknown': 'La contraseña no se puede modificar por esta vía',
    }),
  })
  .min(1)
  .messages({
    'object.min': 'Indicá al menos un dato para modificar',
  });

const idUsuarioSchema = Joi.number().integer().positive().required().messages({
  'number.base': 'El id del usuario debe ser un número',
  'number.integer': 'El id del usuario debe ser un número entero',
  'number.positive': 'El id del usuario debe ser positivo',
});

module.exports = {
  altaUsuarioSchema,
  altaUsuarioAdminSchema,
  editarUsuarioSchema,
  idUsuarioSchema,
  ROLES,
};
