const pool = require('../../../config/db');

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
      [resultado.insertId],
    );

    await conexion.commit();
    return filas[0];
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}

module.exports = { buscarIdsPorCodigo, crearConVerificacion };
