const pool = require('../../../config/db');

async function buscarPorEmail(email) {
  const [filas] = await pool.execute(
    `SELECT
       u.id, u.nombre, u.apellido, u.documento, u.email,
       u.password_hash AS passwordHash,
       u.password_version AS passwordVersion,
       u.intentos_fallidos AS intentosFallidos,
       u.bloqueado_hasta AS bloqueadoHasta,
       r.codigo AS rol,
       e.codigo AS estado
     FROM usuarios u
     INNER JOIN roles r ON r.id = u.id_rol
     INNER JOIN estado_usuario e ON e.id = u.id_estado
     WHERE u.email = ?`,
    [email],
  );

  return filas[0];
}

async function registrarIntentoFallido(id, bloquear) {
  if (bloquear) {
    await pool.execute(
      `UPDATE usuarios
       SET intentos_fallidos = 5,
           bloqueado_hasta = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 15 MINUTE)
       WHERE id = ?`,
      [id],
    );
    return;
  }

  await pool.execute(
    `UPDATE usuarios
     SET intentos_fallidos = LEAST(intentos_fallidos + 1, 5)
     WHERE id = ?`,
    [id],
  );
}

async function reiniciarIntentos(id) {
  await pool.execute(
    `UPDATE usuarios
     SET intentos_fallidos = 0,
         bloqueado_hasta = NULL
     WHERE id = ?`,
    [id],
  );
}

async function buscarActivoPorId(id) {
  const [filas] = await pool.execute(
    `SELECT
       u.id, u.nombre, u.apellido, u.email,
       u.password_version AS passwordVersion,
       r.codigo AS rol,
       e.codigo AS estado
     FROM usuarios u
     INNER JOIN roles r ON r.id = u.id_rol
     INNER JOIN estado_usuario e ON e.id = u.id_estado
     WHERE u.id = ?`,
    [id],
  );

  return filas[0];
}

async function buscarVerificacionPorEmail(email) {
  const [filas] = await pool.execute(
    `SELECT
       u.id AS usuarioId,
       u.id_estado AS estadoId,
       e.codigo AS estado,
       v.id AS verificacionId,
       v.codigo_hash AS codigoHash,
       v.fecha_expiracion AS fechaExpiracion,
       v.intentos_fallidos AS intentosFallidos,
       v.usado
     FROM usuarios u
     INNER JOIN estado_usuario e ON e.id = u.id_estado
     INNER JOIN verificacion_email v ON v.usuario_id = u.id
     WHERE u.email = ?
     ORDER BY v.id DESC
     LIMIT 1`,
    [email],
  );

  return filas[0];
}

async function registrarIntentoVerificacion(verificacionId) {
  await pool.execute(
    `UPDATE verificacion_email
     SET intentos_fallidos = intentos_fallidos + 1
     WHERE id = ? AND usado = 0`,
    [verificacionId],
  );
}

async function confirmarEmail(usuarioId, verificacionId) {
  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();

    const [verificacion] = await conexion.execute(
      `SELECT id
       FROM verificacion_email
       WHERE id = ? AND usuario_id = ? AND usado = 0
       FOR UPDATE`,
      [verificacionId, usuarioId],
    );

    if (verificacion.length === 0) {
      await conexion.rollback();
      return false;
    }

    await conexion.execute(
      `UPDATE verificacion_email
       SET usado = 1, fecha_uso = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [verificacionId],
    );

    await conexion.execute(
      `UPDATE usuarios
       SET id_estado = (
         SELECT id FROM estado_usuario
         WHERE codigo = 'activo'
       )
       WHERE id = ?`,
      [usuarioId],
    );

    await conexion.commit();
    return true;
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}

async function crearTokenRecuperacion(usuarioId, tokenHash, fechaExpiracion) {
  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();
    const [recientes] = await conexion.execute(
      `SELECT id
       FROM token_recuperacion
       WHERE usuario_id = ?
         AND fecha_creacion > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 60 SECOND)
       LIMIT 1
       FOR UPDATE`,
      [usuarioId],
    );

    if (recientes.length > 0) {
      await conexion.rollback();
      return false;
    }

    await conexion.execute(
      `UPDATE token_recuperacion
       SET usado = 1, fecha_uso = CURRENT_TIMESTAMP
       WHERE usuario_id = ? AND usado = 0`,
      [usuarioId],
    );
    await conexion.execute(
      `INSERT INTO token_recuperacion (
         usuario_id, token_hash, fecha_expiracion
       ) VALUES (?, ?, ?)`,
      [usuarioId, tokenHash, fechaExpiracion],
    );
    await conexion.commit();
    return true;
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}

async function restablecerPassword(tokenHash, passwordHash) {
  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();

    const [tokens] = await conexion.execute(
      `SELECT usuario_id, fecha_expiracion
       FROM token_recuperacion
       WHERE token_hash = ? AND usado = 0
       FOR UPDATE`,
      [tokenHash],
    );

    const token = tokens[0];
    if (!token || new Date(token.fecha_expiracion).getTime() <= Date.now()) {
      await conexion.rollback();
      return false;
    }

    const [actualizacion] = await conexion.execute(
      `UPDATE usuarios
       SET password_hash = ?,
           password_version = password_version + 1,
           intentos_fallidos = 0,
           bloqueado_hasta = NULL
       WHERE id = ?`,
      [passwordHash, token.usuario_id],
    );

    if (actualizacion.affectedRows !== 1) {
      await conexion.rollback();
      return false;
    }

    await conexion.execute(
      `UPDATE token_recuperacion
       SET usado = 1, fecha_uso = CURRENT_TIMESTAMP
       WHERE usuario_id = ? AND usado = 0`,
      [token.usuario_id],
    );

    await conexion.commit();
    return true;
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}

async function crearNuevaVerificacion(usuarioId, codigoHash, fechaExpiracion) {
  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();
    const [recientes] = await conexion.execute(
      `SELECT id
       FROM verificacion_email
       WHERE usuario_id = ?
         AND fecha_creacion > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 60 SECOND)
       LIMIT 1
       FOR UPDATE`,
      [usuarioId],
    );

    if (recientes.length > 0) {
      await conexion.rollback();
      return false;
    }

    await conexion.execute(
      `UPDATE verificacion_email
       SET usado = 1, fecha_uso = CURRENT_TIMESTAMP
       WHERE usuario_id = ? AND usado = 0`,
      [usuarioId],
    );
    await conexion.execute(
      `INSERT INTO verificacion_email (
         usuario_id, codigo_hash, fecha_expiracion
       ) VALUES (?, ?, ?)`,
      [usuarioId, codigoHash, fechaExpiracion],
    );
    await conexion.commit();
    return true;
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}

module.exports = {
  buscarPorEmail,
  crearNuevaVerificacion,
  registrarIntentoFallido,
  reiniciarIntentos,
  buscarActivoPorId,
  buscarVerificacionPorEmail,
  registrarIntentoVerificacion,
  confirmarEmail,
  crearTokenRecuperacion,
  restablecerPassword,
};
