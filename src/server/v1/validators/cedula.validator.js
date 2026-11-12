const MULTIPLICADORES = [2, 9, 8, 7, 6, 3, 4];

const MENSAJE_CEDULA = 'La cédula no es válida. Revisá que esté bien escrita, sin puntos ni guiones.';

function cedulaValida(cedula) {
  if (typeof cedula !== 'string' || !/^\d{7,8}$/.test(cedula)) return false;

  const digitos = cedula.padStart(8, '0');
  const suma = MULTIPLICADORES.reduce((total, peso, i) => total + Number(digitos[i]) * peso, 0);
  const verificador = (10 - (suma % 10)) % 10;

  return verificador === Number(digitos[7]);
}

const cedulaSchema = Joi.string()
  .trim()
  .custom((valor, helpers) => (cedulaValida(valor) ? valor : helpers.error('cedula.invalida')))
  .messages({
    'cedula.invalida': MENSAJE_CEDULA,
    'string.base': MENSAJE_CEDULA,
    'string.empty': 'La cédula es obligatoria',
  });

module.exports = { cedulaValida, MENSAJE_CEDULA, cedulaSchema };