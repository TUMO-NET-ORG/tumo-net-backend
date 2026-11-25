const Joi = require('joi');
const { emailSchema } = require('./email.validator');
const { passwordSchema } = require('./password.validator');
const { cedulaSchema } = require('./cedula.validator'); 

// Los valores válidos se leen de las tablas roles y estado_usuario.
// La base comprueba que el código exista al crear, editar o cambiar estados.

function fechaActualLocal() {
  const hoy = new Date();
  const anio = hoy.getFullYear();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  const dia = String(hoy.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

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
    .custom((valor, helpers) => {
      if (valor && valor > fechaActualLocal()) {
        return helpers.message({
          custom: 'La fecha de nacimiento no puede ser posterior a hoy',
        });
      }
      return valor;
    })
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
  nombre: datosPersonales.nombre,
  apellido: datosPersonales.apellido,
  documento: datosPersonales.documento,
  email: datosPersonales.email,
  fechaNacimiento: datosPersonales.fechaNacimiento,
  fotoUrl: datosPersonales.fotoUrl,
  urlPortfolio: datosPersonales.urlPortfolio,
  rol: Joi.string().trim().max(30).required(),
});

// CU01 (RF1): edición por el administrador. Body parcial (al menos un campo).
// La contraseña no se cambia por acá (ver restablecimiento) ni el estado.
const editarUsuarioSchema = altaUsuarioAdminSchema
  .fork(['nombre', 'apellido', 'documento', 'email', 'rol'], (campo) =>
    campo.optional(),
  )
  .keys({
    email: Joi.forbidden().messages({
      'any.unknown': 'El email debe modificarse mediante verificación',
    }),
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

// CU01 (flujo principal, paso 2): filtros y paginación del listado.
const listarUsuariosSchema = Joi.object({
  busqueda: Joi.string().trim().max(100).allow(''),
  rol: Joi.string().trim().max(30).allow(''),
  estado: Joi.string().trim().max(30).allow(''),
  pagina: Joi.number().integer().min(1).default(1),
  tamanioPagina: Joi.number().integer().min(1).max(100).default(20),
});

const cambiarEstadoSchema = Joi.object({
  estado: Joi.string().trim().max(30).required()
    .messages({ 'any.required': 'Indicá el estado' }),
});

module.exports = {
  cambiarEstadoSchema,
  listarUsuariosSchema,
  altaUsuarioSchema,
  altaUsuarioAdminSchema,
  editarUsuarioSchema,
  idUsuarioSchema,
};
