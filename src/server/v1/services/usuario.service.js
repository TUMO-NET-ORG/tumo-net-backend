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

function errorDuplicado(error) {
  // El índice único que falló viene en el mensaje de MySQL.
  if (String(error.sqlMessage || error.message).includes('uk_usuario_email')) {
    return new AppError(
      409,
      'Ya existe un usuario con ese email',
      'EMAIL_DUPLICADO',
    );
  }

  return new AppError(
    409,
    'Ya existe un usuario con ese documento',
    'DOCUMENTO_DUPLICADO',
  );
}

// CU01 (RF1): el administrador crea un usuario individualmente con el rol
// indicado. La cuenta queda activa (no requiere verificar el email, porque la
// crea el administrador) y la contraseña inicial se guarda hasheada (RNF07).
async function crearUsuarioPorAdmin(datos) {
  const ids = await usuarioRepository.buscarIdsPorCodigo(datos.rol, 'activo');

  if (!ids || ids.id_estado === null) {
    throw new AppError(
      500,
      'La configuración inicial de roles y estados está incompleta',
      'CONFIGURACION_USUARIO_INCOMPLETA',
    );
  }

  if (ids.id_rol === null) {
    throw new AppError(400, 'El rol indicado no existe', 'ROL_INVALIDO');
  }

  const { password, ...datosUsuario } = datos;
  const passwordHash = await argon2.hash(password);

  try {
    return await usuarioRepository.crear({
      ...datosUsuario,
      passwordHash,
      idRol: ids.id_rol,
      idEstado: ids.id_estado,
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw errorDuplicado(error);
    }

    throw error;
  }
}

// CU01 (RF1): el administrador edita los datos de un usuario, incluido el
// rol. El cambio de rol aplica en la próxima petición del usuario, porque el
// middleware lee el rol desde la base y no desde el token.
async function editarUsuarioPorAdmin(id, cambios, admin) {
  const usuario = await usuarioRepository.buscarPorId(id);

  if (!usuario) {
    throw new AppError(404, 'El usuario no existe', 'USUARIO_NO_ENCONTRADO');
  }

  if (
    id === admin.id &&
    cambios.rol !== undefined &&
    cambios.rol !== 'administrador'
  ) {
    throw new AppError(
      400,
      'No podés quitarte a vos mismo el rol de administrador',
      'AUTO_CAMBIO_ROL',
    );
  }

  const { rol, ...datos } = cambios;

  if (rol !== undefined) {
    const ids = await usuarioRepository.buscarIdsPorCodigo(rol, 'activo');

    if (!ids || ids.id_rol === null) {
      throw new AppError(400, 'El rol indicado no existe', 'ROL_INVALIDO');
    }

    datos.idRol = ids.id_rol;
  }

  try {
    return await usuarioRepository.actualizar(id, datos);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw errorDuplicado(error);
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

module.exports = {
  crearUsuarioPorAdmin,
  darDeAltaUsuario,
  editarUsuarioPorAdmin,
  reenviarCodigoVerificacion,
};
