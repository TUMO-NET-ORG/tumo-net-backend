const argon2 = require('argon2');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const AppError = require('../errors/AppError');
const authRepository = require('../repositories/auth.repository');
const { enviarEnlaceRecuperacion } = require('./mail.service');

const MAX_INTENTOS = 5;
const DURACION_BLOQUEO_MINUTOS = 15;
const CREDENCIALES_INVALIDAS = 'Email o contraseña incorrectos';
const MAX_INTENTOS_VERIFICACION = 5;
const DURACION_RECUPERACION_MINUTOS = Number(
  process.env.RECOVERY_TOKEN_EXPIRES_MINUTES || 15,
);
const MENSAJE_TOKEN_INVALIDO = 'El enlace de recuperación no es válido';

function hashearCodigo(codigo) {
  return crypto.createHash('sha256').update(codigo).digest('hex');
}

function crearToken(usuario) {
  if (!process.env.JWT_SECRET) {
    throw new AppError(
      500,
      'La configuración JWT está incompleta',
      'CONFIGURACION_JWT_INCOMPLETA',
    );
  }

  return jwt.sign(
    {
      sub: String(usuario.id),
      email: usuario.email,
      rol: usuario.rol,
      passwordVersion: usuario.passwordVersion,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' },
  );
}

function estaBloqueado(bloqueadoHasta) {
  return bloqueadoHasta && new Date(bloqueadoHasta).getTime() > Date.now();
}

// Hash de referencia para comparar cuando el email no existe, así la
// respuesta tarda lo mismo y no revela qué cuentas están registradas.
let hashReferencia;
async function obtenerHashReferencia() {
  if (!hashReferencia) {
    hashReferencia = await argon2.hash(crypto.randomBytes(16).toString('hex'));
  }
  return hashReferencia;
}

function errorBloqueo() {
  return new AppError(
    423,
    `La cuenta está bloqueada temporalmente. Reintentá en ${DURACION_BLOQUEO_MINUTOS} minutos`,
    'USUARIO_BLOQUEADO',
  );
}

async function iniciarSesion(email, password) {
  const usuario = await authRepository.buscarPorEmail(email);

  if (!usuario) {
    await argon2.verify(await obtenerHashReferencia(), password);
    throw new AppError(401, CREDENCIALES_INVALIDAS, 'CREDENCIALES_INVALIDAS');
  }

  const passwordValida = await argon2.verify(usuario.passwordHash, password);

  // Mientras la cuenta está bloqueada no se suman intentos. Solo se informa
  // el bloqueo a quien conoce la contraseña, para no confirmar que la cuenta
  // existe a quien está probando contraseñas.
  if (estaBloqueado(usuario.bloqueadoHasta)) {
    if (passwordValida) {
      throw errorBloqueo();
    }
    throw new AppError(401, CREDENCIALES_INVALIDAS, 'CREDENCIALES_INVALIDAS');
  }

  if (!passwordValida) {
    const intentosActualizados = usuario.intentosFallidos + 1;
    const debeBloquear = intentosActualizados >= MAX_INTENTOS;

    await authRepository.registrarIntentoFallido(usuario.id, debeBloquear);

    if (debeBloquear) {
      throw errorBloqueo();
    }

    throw new AppError(401, CREDENCIALES_INVALIDAS, 'CREDENCIALES_INVALIDAS');
  }

  if (usuario.estado !== 'activo') {
    throw new AppError(
      403,
      usuario.estado === 'pendiente_verificacion'
        ? 'Tenés que verificar tu email antes de iniciar sesión'
        : 'La cuenta no está activa',
      usuario.estado === 'pendiente_verificacion'
        ? 'EMAIL_NO_VERIFICADO'
        : 'USUARIO_NO_ACTIVO',
    );
  }

  await authRepository.reiniciarIntentos(usuario.id);

  return {
    token: crearToken(usuario),
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      documento: usuario.documento,
      email: usuario.email,
      rol: usuario.rol,
      estado: usuario.estado,
    },
  };
}

async function validarUsuarioToken(id, passwordVersion) {
  const usuario = await authRepository.buscarActivoPorId(id);

  if (!usuario || usuario.estado !== 'activo') {
    throw new AppError(
      401,
      'El usuario no está disponible',
      'USUARIO_NO_AUTORIZADO',
    );
  }

  if (
    !Number.isInteger(passwordVersion) ||
    usuario.passwordVersion !== passwordVersion
  ) {
    throw new AppError(401, 'El token dejó de ser válido', 'TOKEN_INVALIDO');
  }

  return usuario;
}

function perfilPublico(usuario) {
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    email: usuario.email,
    rol: usuario.rol,
    estado: usuario.estado,
  };
}

async function verificarEmail(email, codigo) {
  const verificacion = await authRepository.buscarVerificacionPorEmail(email);

  if (!verificacion || verificacion.estado !== 'pendiente_verificacion') {
    throw new AppError(
      400,
      'La solicitud de verificación no es válida',
      'VERIFICACION_INVALIDA',
    );
  }

  if (verificacion.usado) {
    throw new AppError(
      400,
      'El código de verificación ya fue utilizado',
      'CODIGO_YA_UTILIZADO',
    );
  }

  if (verificacion.intentosFallidos >= MAX_INTENTOS_VERIFICACION) {
    throw new AppError(
      423,
      'Se superó la cantidad máxima de intentos de verificación',
      'VERIFICACION_BLOQUEADA',
    );
  }

  if (new Date(verificacion.fechaExpiracion).getTime() <= Date.now()) {
    throw new AppError(
      400,
      'El código de verificación expiró',
      'CODIGO_VENCIDO',
    );
  }

  const codigoValido = crypto.timingSafeEqual(
    Buffer.from(hashearCodigo(codigo), 'hex'),
    Buffer.from(verificacion.codigoHash, 'hex'),
  );

  if (!codigoValido) {
    await authRepository.registrarIntentoVerificacion(
      verificacion.verificacionId,
    );
    throw new AppError(
      400,
      'El código de verificación no es válido',
      'CODIGO_INVALIDO',
    );
  }

  const confirmado = await authRepository.confirmarEmail(
    verificacion.usuarioId,
    verificacion.verificacionId,
  );

  if (!confirmado) {
    throw new AppError(
      400,
      'El código de verificación ya no está disponible',
      'VERIFICACION_INVALIDA',
    );
  }
}

async function solicitarRecuperacion(email) {
  const usuario = await authRepository.buscarPorEmail(email);

  if (!usuario || usuario.estado !== 'activo') {
    return;
  }

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashearCodigo(token);
  const fechaExpiracion = new Date(
    Date.now() + DURACION_RECUPERACION_MINUTOS * 60 * 1000,
  );

  const creado = await authRepository.crearTokenRecuperacion(
    usuario.id,
    tokenHash,
    fechaExpiracion,
  );

  if (creado) {
    try {
      await enviarEnlaceRecuperacion(usuario.email, token);
    } catch (error) {
      // No se propaga: la respuesta debe ser igual exista o no el email.
      console.error('No se pudo enviar el enlace de recuperación:', error.message);
    }
  }
}

async function restablecerPassword(token, nuevaPassword) {
  const passwordHash = await argon2.hash(nuevaPassword);
  const actualizado = await authRepository.restablecerPassword(
    hashearCodigo(token),
    passwordHash,
  );

  if (!actualizado) {
    throw new AppError(400, MENSAJE_TOKEN_INVALIDO, 'TOKEN_INVALIDO');
  }
}

module.exports = {
  iniciarSesion,
  perfilPublico,
  validarUsuarioToken,
  verificarEmail,
  solicitarRecuperacion,
  restablecerPassword,
};
