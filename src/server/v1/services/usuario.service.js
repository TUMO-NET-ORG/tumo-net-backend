const argon2 = require('argon2');
const crypto = require('crypto');
const AppError = require('../errors/AppError');
const usuarioRepository = require('../repositories/usuario.repository');
const authRepository = require('../repositories/auth.repository');
const grupoRepository = require('../repositories/grupo.repository');
const { ROLES_RESPONSABLE } = require('./grupo.service');
const { enviarCodigoVerificacion, enviarEnlaceAccion } = require('./mail.service');

const DURACION_CODIGO_MINUTOS = 15;

// Contraseña temporal (CU01, flujo 3.a). Sin caracteres que se confunden al
// dictarla (0/O, 1/l/I). Siempre incluye mayúscula, minúscula y número, así
// cumple la política de RNF07.
const LARGO_PASSWORD_TEMPORAL = 16;
const MAYUSCULAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MINUSCULAS = 'abcdefghijkmnopqrstuvwxyz';
const DIGITOS = '23456789';
const CARACTERES_TEMPORAL = MAYUSCULAS + MINUSCULAS + DIGITOS;

function caracterAleatorio(caracteres) {
  return caracteres[crypto.randomInt(caracteres.length)];
}

function generarPasswordTemporal() {
  const caracteres = [
    caracterAleatorio(MAYUSCULAS),
    caracterAleatorio(MINUSCULAS),
    caracterAleatorio(DIGITOS),
  ];

  while (caracteres.length < LARGO_PASSWORD_TEMPORAL) {
    caracteres.push(caracterAleatorio(CARACTERES_TEMPORAL));
  }

  // Mezcla (Fisher-Yates) para que los obligatorios no queden al principio.
  for (let i = caracteres.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]];
  }

  return caracteres.join('');
}

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
  const ids = await usuarioRepository.buscarIdsPorCodigo(
    datos.rol,
    'pendiente_verificacion',
  );

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

  const passwordHash = await argon2.hash(crypto.randomBytes(32).toString('hex'));

  try {
    const usuario = await usuarioRepository.crearPendientePorAdmin({
      ...datos,
      passwordHash,
      idRol: ids.id_rol,
      idEstado: ids.id_estado,
    });
    const token = crypto.randomBytes(32).toString('hex');
    await authRepository.crearTokenAccion(
      usuario.id,
      hashearCodigo(token),
      new Date(Date.now() + DURACION_CODIGO_MINUTOS * 60 * 1000),
      'invitacion',
    );
    try {
      await enviarEnlaceAccion(datos.email, token, 'invitacion');
    } catch (error) {
      throw new AppError(
        502,
        'La cuenta quedó pendiente, pero no se pudo enviar el enlace',
        'INVITACION_NO_ENVIADA',
      );
    }
    return usuario;
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw errorDuplicado(error);
    }
    throw error;
  }
}

async function obtenerUsuarioPorAdmin(id) {
  const usuario = await usuarioRepository.buscarPorId(id);
  if (!usuario) {
    throw new AppError(404, 'El usuario no existe', 'USUARIO_NO_ENCONTRADO');
  }
  return usuario;
}

async function solicitarCambioEmailPorAdmin(id, email) {
  const usuario = await usuarioRepository.buscarPorId(id);
  if (!usuario) {
    throw new AppError(404, 'El usuario no existe', 'USUARIO_NO_ENCONTRADO');
  }

  const existente = await authRepository.buscarPorEmail(email);
  if (existente && existente.id !== id) {
    throw new AppError(409, 'Ya existe un usuario con ese email', 'EMAIL_DUPLICADO');
  }

  const token = crypto.randomBytes(32).toString('hex');
  await authRepository.crearTokenAccion(
    id,
    hashearCodigo(token),
    new Date(Date.now() + DURACION_CODIGO_MINUTOS * 60 * 1000),
    'cambio_email',
    email,
  );
  await enviarEnlaceAccion(email, token, 'cambio_email');
  return { mensaje: 'Se envió un enlace de confirmación al nuevo email' };
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

    // Un rol que no puede ser responsable (alumno) no se le puede dar a quien
    // es responsable de algún grupo: el grupo quedaría con un responsable inválido.
    if (!ROLES_RESPONSABLE.includes(rol)) {
      const grupos = await grupoRepository.buscarGruposDondeEsResponsable(id);
      if (grupos.length > 0) {
        throw new AppError(
          409,
          `No se puede cambiar el rol: es responsable de ${listarNombres(grupos)}. Asigná otro responsable primero.`,
          'RESPONSABLE_DE_GRUPOS',
          { grupos },
        );
      }
    }
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

// CU01 (flujo 3.b, RF2): el administrador cambia el estado de un usuario.
// Al dejar de estar activo no puede iniciar sesión, y el token que ya tenía
// deja de servir en su próxima petición (el middleware lee el estado de la
// base).
async function cambiarEstadoPorAdmin(id, estado, admin) {
  if (id === admin.id) {
    throw new AppError(
      400,
      'No podés cambiar tu propio estado',
      'AUTO_CAMBIO_ESTADO',
    );
  }

  const usuario = await usuarioRepository.buscarPorId(id);

  if (!usuario) {
    throw new AppError(404, 'El usuario no existe', 'USUARIO_NO_ENCONTRADO');
  }

  const idEstado = await usuarioRepository.buscarIdEstadoPorCodigo(estado);

  if (idEstado === null) {
    throw new AppError(
      500,
      'La configuración inicial de roles y estados está incompleta',
      'CONFIGURACION_USUARIO_INCOMPLETA',
    );
  }

  if (estado !== 'dado_de_baja') {
    return usuarioRepository.actualizarEstado(id, idEstado);
  }

  // Un usuario dado de baja deja de estar en todos sus grupos, pero ningún
  // grupo puede quedar sin responsable: si es el único de alguno, no se da de baja.
  const resultado = await usuarioRepository.darDeBajaYQuitarDeGrupos(id, idEstado);
  if (resultado.gruposSinOtroResponsable) {
    const grupos = resultado.gruposSinOtroResponsable;
    throw new AppError(
      409,
      `No se puede dar de baja: es el único responsable de ${listarNombres(grupos)}. Asigná otro responsable primero.`,
      'UNICO_RESPONSABLE_DE_GRUPOS',
      { grupos },
    );
  }

  return resultado.usuario;
}

function listarNombres(grupos) {
  return grupos.map((grupo) => grupo.nombre).join(', ');
}

// CU01 (flujo 3.a, RF4): el administrador restablece la contraseña de un
// usuario. La temporal se devuelve una sola vez para que el administrador se
// la comunique; solo se guarda su hash (RNF07).
async function restablecerPasswordPorAdmin(id, admin) {
  if (id === admin.id) {
    throw new AppError(
      400,
      'Para cambiar tu propia contraseña usá la opción de cambio de contraseña',
      'AUTO_RESTABLECER_PASSWORD',
    );
  }

  const usuario = await usuarioRepository.buscarPorId(id);

  if (!usuario) {
    throw new AppError(404, 'El usuario no existe', 'USUARIO_NO_ENCONTRADO');
  }

  const passwordTemporal = generarPasswordTemporal();
  const passwordHash = await argon2.hash(passwordTemporal);
  const usuarioActualizado = await usuarioRepository.restablecerPasswordTemporal(
    id,
    passwordHash,
  );

  return { usuario: usuarioActualizado, passwordTemporal };
}

// CU01 (flujo principal, paso 2): listado paginado para el administrador.
async function listarUsuarios({ busqueda, rol, estado, pagina, tamanioPagina }) {
  const { usuarios, total } = await usuarioRepository.listar({
    busqueda,
    rol,
    estado,
    limite: tamanioPagina,
    offset: (pagina - 1) * tamanioPagina,
  });

  return {
    usuarios,
    paginacion: {
      pagina,
      tamanioPagina,
      total,
      totalPaginas: Math.ceil(total / tamanioPagina),
    },
  };
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
  cambiarEstadoPorAdmin,
  crearUsuarioPorAdmin,
  darDeAltaUsuario,
  editarUsuarioPorAdmin,
  obtenerUsuarioPorAdmin,
  generarPasswordTemporal,
  listarUsuarios,
  solicitarCambioEmailPorAdmin,
  reenviarCodigoVerificacion,
  restablecerPasswordPorAdmin,
};
