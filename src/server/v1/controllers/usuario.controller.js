const { altaUsuarioSchema } = require('../validators/usuario.validator');
const { darDeAltaUsuario } = require('../services/usuario.service');

async function crearUsuario(req, res) {
  const validacion = altaUsuarioSchema.validate(req.body, {
    abortEarly: false,
  });

  if (validacion.error) {
    return res.status(400).json({
      error: 'DATOS_INVALIDOS',
      detalles: validacion.error.details.map((detalle) => ({
        campo: detalle.path.join('.'),
        mensaje: detalle.message,
      })),
    });
  }

  const resultado = await darDeAltaUsuario(validacion.value);
  return res.status(202).json({ usuario: resultado.usuario });
}

module.exports = { crearUsuario };
