const pool = require('../../../config/db');

async function buscarPorEmail(email) {
  const [filas] = await pool.execute(
    `SELECT
       u.id, u.nombre, u.apellido, u.documento, u.email,
       u.password_hash AS passwordHash,
       u.password_version AS passwordVersion,
       u.debe_cambiar_password AS debeCambiarPassword,
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
       u.debe_cambiar_password AS debeCambiarPassword,
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
           debe_cambiar_password = 0,
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

async function crearTokenAccion(
  usuarioId,
  tokenHash,
  fechaExpiracion,
  tipo,
  emailPendiente = null,
) {
  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();
    await conexion.execute(
      `UPDATE token_recuperacion
       SET usado = 1, fecha_uso = CURRENT_TIMESTAMP
       WHERE usuario_id = ? AND tipo = ? AND usado = 0`,
      [usuarioId, tipo],
    );
    await conexion.execute(
      `INSERT INTO token_recuperacion (
         usuario_id, token_hash, tipo, email_pendiente, fecha_expiracion
       ) VALUES (?, ?, ?, ?, ?)`,
      [usuarioId, tokenHash, tipo, emailPendiente, fechaExpiracion],
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

async function buscarTokenAccion(tokenHash) {
  const [filas] = await pool.execute(
    `SELECT usuario_id AS usuarioId, tipo, email_pendiente AS emailPendiente,
            fecha_expiracion AS fechaExpiracion, usado
     FROM token_recuperacion
     WHERE token_hash = ?`,
    [tokenHash],
  );
  return filas[0];
}

async function completarInvitacion(tokenHash, passwordHash, versionTerminos) {
  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();
    const [tokens] = await conexion.execute(
      `SELECT usuario_id
       FROM token_recuperacion
       WHERE token_hash = ? AND tipo = 'invitacion' AND usado = 0
         AND fecha_expiracion > CURRENT_TIMESTAMP
       FOR UPDATE`,
      [tokenHash],
    );
    if (tokens.length === 0) {
      await conexion.rollback();
      return false;
    }

    const [actualizacion] = await conexion.execute(
      `UPDATE usuarios
       SET password_hash = ?, password_version = password_version + 1,
           debe_cambiar_password = 0,
           fecha_aceptacion_terminos = CURRENT_TIMESTAMP,
           version_terminos = ?,
           id_estado = (SELECT id FROM estado_usuario WHERE codigo = 'activo')
       WHERE id = ? AND id_estado = (
         SELECT id FROM estado_usuario WHERE codigo = 'pendiente_verificacion'
       )`,
      [passwordHash, versionTerminos, tokens[0].usuario_id],
    );
    if (actualizacion.affectedRows !== 1) {
      await conexion.rollback();
      return false;
    }

    await conexion.execute(
      `UPDATE token_recuperacion
       SET usado = 1, fecha_uso = CURRENT_TIMESTAMP
       WHERE token_hash = ?`,
      [tokenHash],
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

async function completarCambioEmail(tokenHash) {
  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();
    const [tokens] = await conexion.execute(
      `SELECT t.usuario_id, t.email_pendiente, e.codigo AS estado
       FROM token_recuperacion t
       INNER JOIN usuarios u ON u.id = t.usuario_id
       INNER JOIN estado_usuario e ON e.id = u.id_estado
       WHERE t.token_hash = ? AND t.tipo = 'cambio_email' AND t.usado = 0
         AND t.fecha_expiracion > CURRENT_TIMESTAMP
       FOR UPDATE`,
      [tokenHash],
    );
    const token = tokens[0];
    if (!token || !token.email_pendiente) {
      await conexion.rollback();
      return false;
    }

    const [actualizacion] = await conexion.execute(
      'UPDATE usuarios SET email = ? WHERE id = ?',
      [token.email_pendiente, token.usuario_id],
    );
    if (actualizacion.affectedRows !== 1) {
      await conexion.rollback();
      return false;
    }
    await conexion.execute(
      `UPDATE token_recuperacion
       SET usado = 1, fecha_uso = CURRENT_TIMESTAMP
       WHERE token_hash = ?`,
      [tokenHash],
    );
    await conexion.commit();
    return {
      usuarioId: token.usuario_id,
      email: token.email_pendiente,
      pendienteVerificacion: token.estado === 'pendiente_verificacion',
    };
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}

// Cambio de contraseña con sesión iniciada: invalida los tokens anteriores
// (password_version) y levanta la obligación de cambiarla.
async function actualizarPassword(id, passwordHash) {
  const [resultado] = await pool.execute(
    `UPDATE usuarios
     SET password_hash = ?,
         password_version = password_version + 1,
         debe_cambiar_password = 0
     WHERE id = ?`,
    [passwordHash, id],
  );

  return resultado.affectedRows === 1;
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
  actualizarPassword,
  crearNuevaVerificacion,
  registrarIntentoFallido,
  reiniciarIntentos,
  buscarActivoPorId,
  buscarVerificacionPorEmail,
  registrarIntentoVerificacion,
  confirmarEmail,
  crearTokenRecuperacion,
  crearTokenAccion,
  buscarTokenAccion,
  completarInvitacion,
  completarCambioEmail,
  restablecerPassword,
};
