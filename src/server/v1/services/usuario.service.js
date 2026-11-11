const argon2 = require('argon2');
const crypto = require('crypto');
const AppError = require('../errors/AppError');
const usuarioRepository = require('../repositories/usuario.repository');
const authRepository = require('../repositories/auth.repository');
const { enviarCodigoVerificacion } = require('./mail.service');

const DURACION_CODIGO_MINUTOS = 15;

function generarCodigoVerificacion() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashearCodigo(codigo) {
  return crypto.createHash('sha256').update(codigo).digest('hex');
}

async function darDeAltaUsuario(datos) {
  const ids = await usuarioRepository.buscarIdsPorCodigo('alumno', 'pendiente_verificacion');

  if (!ids || ids.id_rol === null || ids.id_estado === null) {
    throw new AppError(
      500,
      'La configuración inicial de roles y estados está incompleta',
      'CONFIGURACION_USUARIO_INCOMPLETA',
    );
  }

  const passwordHash = await argon2.hash(datos.password);
  const codigoVerificacion = generarCodigoVerificacion();
  const codigoHash = hashearCodigo(codigoVerificacion);
  const fechaExpiracion = new Date(
    Date.now() + DURACION_CODIGO_MINUTOS * 60 * 1000,
  );

  try {
    const usuario = await usuarioRepository.crearConVerificacion(
      {
        ...datos,
        passwordHash,
        idRol: ids.id_rol,
        idEstado: ids.id_estado,
      },
      codigoHash,
      fechaExpiracion,
    );

    await enviarCodigoVerificacion(datos.email, codigoVerificacion);

    return { usuario, codigoVerificacion };
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw new AppError(
        409,
        'El email o documento ya está registrado',
        'USUARIO_DUPLICADO',
      );
    }

    throw error;
  }
}

// Genera un código nuevo para un usuario que quedó pendiente de verificación
// (por ejemplo, si el mail del registro no llegó o el código venció).
// Responde igual exista o no la cuenta, para no revelar emails registrados.
async function reenviarCodigoVerificacion(email) {
  const usuario = await authRepository.buscarPorEmail(email);

  if (!usuario || usuario.estado !== 'pendiente_verificacion') {
    return;
  }

  const codigoVerificacion = generarCodigoVerificacion();
  const fechaExpiracion = new Date(
    Date.now() + DURACION_CODIGO_MINUTOS * 60 * 1000,
  );

  const creado = await authRepository.crearNuevaVerificacion(
    usuario.id,
    hashearCodigo(codigoVerificacion),
    fechaExpiracion,
  );

  if (!creado) {
    return;
  }

  try {
    await enviarCodigoVerificacion(usuario.email, codigoVerificacion);
  } catch (error) {
    console.error('No se pudo reenviar el código de verificación:', error.message);
  }
}

module.exports = { darDeAltaUsuario, reenviarCodigoVerificacion };
