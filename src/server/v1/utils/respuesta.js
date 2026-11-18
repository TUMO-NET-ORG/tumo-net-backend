function responderDatosInvalidos(res, error) {
  return res.status(400).json({
    error: 'DATOS_INVALIDOS',
    detalles: error.details.map((detalle) => ({
      campo: detalle.path.join('.'),
      mensaje: detalle.message,
    })),
  });
}

module.exports = { responderDatosInvalidos };