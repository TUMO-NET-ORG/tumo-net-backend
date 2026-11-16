const pool = require('../../../config/db');

// Datos del usuario que se pueden devolver al cliente (sin hash ni contadores).
const COLUMNAS_PUBLICAS = `
       u.id, u.nombre, u.apellido, u.documento, u.email,
       u.fecha_nacimiento AS fechaNacimiento,
       u.foto_url AS fotoUrl,
       u.url_portfolio AS urlPortfolio,
       r.codigo AS rol,
       e.codigo AS estado,
       u.fecha_alta AS fechaAlta,
       u.fecha_aceptacion_terminos AS fechaAceptacionTerminos,
       u.version_terminos AS versionTerminos`;

const FROM_USUARIOS = `
     FROM usuarios u
     INNER JOIN roles r ON r.id = u.id_rol
     INNER JOIN estado_usuario e ON e.id = u.id_estado`;

async function buscarPublicoPorId(conexion, id) {
  const [filas] = await conexion.execute(
    `SELECT ${COLUMNAS_PUBLICAS} ${FROM_USUARIOS}
     WHERE u.id = ?`,
    [id],
  );

  return filas[0];
}

async function buscarIdsPorCodigo(rolCodigo, estadoCodigo) {
  const [filas] = await pool.query(
    `SELECT
       (SELECT id FROM roles WHERE codigo = ?) AS id_rol,
       (SELECT id FROM estado_usuario WHERE codigo = ?) AS id_estado`,
    [rolCodigo, estadoCodigo],
  );

  return filas[0];
}

async function crearConVerificacion(usuario, codigoHash, fechaExpiracion) {
  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();

    const [resultado] = await conexion.execute(
      `INSERT INTO usuarios (
         nombre, apellido, documento, email, password_hash,
         fecha_nacimiento, foto_url, url_portfolio, id_rol, id_estado,
         fecha_aceptacion_terminos, version_terminos
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
      [
        usuario.nombre,
        usuario.apellido,
        usuario.documento,
        usuario.email,
        usuario.passwordHash,
        usuario.fechaNacimiento ?? null,
        usuario.fotoUrl ?? null,
        usuario.urlPortfolio ?? null,
        usuario.idRol,
        usuario.idEstado,
        usuario.versionTerminos,
      ],
    );

    await conexion.execute(
      `INSERT INTO verificacion_email (
         usuario_id, codigo_hash, fecha_expiracion
       ) VALUES (?, ?, ?)`,
      [resultado.insertId, codigoHash, fechaExpiracion],
    );

    const usuarioCreado = await buscarPublicoPorId(conexion, resultado.insertId);

    await conexion.commit();
    return usuarioCreado;
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}

// CU01 (RF1): alta individual por el administrador. A diferencia del
// autorregistro, no genera código de verificación ni registra aceptación de
// términos: la cuenta la crea el administrador y queda activa. La contraseña
// inicial la conoce el administrador, por eso se obliga a cambiarla al ingresar.
async function crear(usuario) {
  const [resultado] = await pool.execute(
    `INSERT INTO usuarios (
       nombre, apellido, documento, email, password_hash,
       fecha_nacimiento, foto_url, url_portfolio, id_rol, id_estado,
       debe_cambiar_password
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      usuario.nombre,
      usuario.apellido,
      usuario.documento,
      usuario.email,
      usuario.passwordHash,
      usuario.fechaNacimiento ?? null,
      usuario.fotoUrl ?? null,
      usuario.urlPortfolio ?? null,
      usuario.idRol,
      usuario.idEstado,
    ],
  );

  return buscarPublicoPorId(pool, resultado.insertId);
}

async function buscarPorId(id) {
  return buscarPublicoPorId(pool, id);
}

// Lista blanca de campos editables -> columna. Solo estas columnas pueden
// aparecer en el UPDATE; los valores van siempre como parámetros (RNF08).
const COLUMNAS_EDITABLES = {
  nombre: 'nombre',
  apellido: 'apellido',
  documento: 'documento',
  email: 'email',
  fechaNacimiento: 'fecha_nacimiento',
  fotoUrl: 'foto_url',
  urlPortfolio: 'url_portfolio',
  idRol: 'id_rol',
};

async function actualizar(id, cambios) {
  const campos = Object.keys(cambios).filter(
    (campo) => COLUMNAS_EDITABLES[campo] && cambios[campo] !== undefined,
  );

  if (campos.length > 0) {
    await pool.execute(
      `UPDATE usuarios
       SET ${campos.map((campo) => `${COLUMNAS_EDITABLES[campo]} = ?`).join(', ')}
       WHERE id = ?`,
      [...campos.map((campo) => cambios[campo]), id],
    );
  }

  return buscarPublicoPorId(pool, id);
}

// Escapa los comodines de LIKE para que la búsqueda sea literal.
function escaparLike(texto) {
  return texto.replace(/[\\%_]/g, (caracter) => `\\${caracter}`);
}

// CU01 (flujo principal, paso 2): listado paginado con búsqueda y filtros.
// Sin filtro de estado se excluyen los usuarios dados de baja (baja lógica).
async function listar({ busqueda, rol, estado, limite, offset }) {
  const condiciones = [];
  const parametros = [];

  if (estado) {
    condiciones.push('e.codigo = ?');
    parametros.push(estado);
  } else {
    condiciones.push("e.codigo <> 'dado_de_baja'");
  }

  if (rol) {
    condiciones.push('r.codigo = ?');
    parametros.push(rol);
  }

  if (busqueda) {
    const patron = `%${escaparLike(busqueda)}%`;
    condiciones.push(
      `(u.nombre LIKE ? OR u.apellido LIKE ?
        OR CONCAT(u.nombre, ' ', u.apellido) LIKE ? OR u.email LIKE ?)`,
    );
    parametros.push(patron, patron, patron, patron);
  }

  const where = `WHERE ${condiciones.join(' AND ')}`;

  const [conteo] = await pool.query(
    `SELECT COUNT(*) AS total ${FROM_USUARIOS} ${where}`,
    parametros,
  );

  // pool.query (y no execute) por el problema de mysql2 con LIMIT ? en
  // sentencias preparadas. limite y offset llegan validados como enteros.
  const [usuarios] = await pool.query(
    `SELECT ${COLUMNAS_PUBLICAS} ${FROM_USUARIOS}
     ${where}
     ORDER BY u.apellido, u.nombre, u.id
     LIMIT ? OFFSET ?`,
    [...parametros, limite, offset],
  );

  return { usuarios, total: Number(conteo[0].total) };
}

async function buscarIdEstadoPorCodigo(codigo) {
  const [filas] = await pool.execute(
    'SELECT id FROM estado_usuario WHERE codigo = ?',
    [codigo],
  );

  return filas[0] ? filas[0].id : null;
}

// CU01 (flujo 3.b): cambio de estado. La baja es lógica: el registro no se borra.
async function actualizarEstado(id, idEstado) {
  await pool.execute('UPDATE usuarios SET id_estado = ? WHERE id = ?', [
    idEstado,
    id,
  ]);

  return buscarPublicoPorId(pool, id);
}

// CU01 (flujo 3.a, RF4): reemplaza la contraseña por una temporal. Invalida
// las sesiones abiertas (password_version), obliga a cambiarla en el próximo
// ingreso, desbloquea la cuenta e invalida los enlaces de recuperación
// pendientes para que no pisen la temporal.
async function restablecerPasswordTemporal(id, passwordHash) {
  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();

    await conexion.execute(
      `UPDATE usuarios
       SET password_hash = ?,
           password_version = password_version + 1,
           debe_cambiar_password = 1,
           intentos_fallidos = 0,
           bloqueado_hasta = NULL
       WHERE id = ?`,
      [passwordHash, id],
    );

    await conexion.execute(
      `UPDATE token_recuperacion
       SET usado = 1, fecha_uso = CURRENT_TIMESTAMP
       WHERE usuario_id = ? AND usado = 0`,
      [id],
    );

    const usuario = await buscarPublicoPorId(conexion, id);

    await conexion.commit();
    return usuario;
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}

module.exports = {
  actualizar,
  restablecerPasswordTemporal,
  actualizarEstado,
  buscarIdEstadoPorCodigo,
  listar,
  buscarIdsPorCodigo,
  buscarPorId,
  crear,
  crearConVerificacion,
};
