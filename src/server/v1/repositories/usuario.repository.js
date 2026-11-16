const pool = require('../../../config/db');

// Datos del usuario que se pueden devolver al cliente (sin hash ni contadores).
async function buscarPublicoPorId(conexion, id) {
  const [filas] = await conexion.execute(
    `SELECT
       u.id, u.nombre, u.apellido, u.documento, u.email,
       u.fecha_nacimiento AS fechaNacimiento,
       u.foto_url AS fotoUrl,
       u.url_portfolio AS urlPortfolio,
       r.codigo AS rol,
       e.codigo AS estado,
       u.fecha_alta AS fechaAlta,
       u.fecha_aceptacion_terminos AS fechaAceptacionTerminos,
       u.version_terminos AS versionTerminos
     FROM usuarios u
     INNER JOIN roles r ON r.id = u.id_rol
     INNER JOIN estado_usuario e ON e.id = u.id_estado
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

module.exports = { buscarIdsPorCodigo, crear, crearConVerificacion };
