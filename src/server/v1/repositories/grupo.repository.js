
const pool = require('../../../config/db');

/* Trae id + código de rol + código de estado de una lista de usuarios.*/
async function buscarUsuariosConRol(ids) {
  if (ids.length === 0) return [];
  // pool.query (y no pool.execute) porque query sí expande el array en "IN (?)"
  const [filas] = await pool.query(
    `SELECT u.id, r.codigo AS rol, e.codigo AS estado
       FROM usuarios u
       JOIN roles r ON r.id = u.id_rol
       JOIN estado_usuario e ON e.id = u.id_estado
      WHERE u.id IN (?)`,
    [ids]
  );
  return filas;
}

/* true si el usuario es responsable de ese grupo. */
async function esResponsable(grupoId, usuarioId) {
  const [filas] = await pool.execute(
    `SELECT 1
       FROM grupo_integrantes
      WHERE grupo_id = ? AND usuario_id = ? AND es_responsable = 1`,
    [grupoId, usuarioId]
  );
  return filas.length > 0;
}

/* true si el usuario está en el grupo (como responsable o como integrante). */
async function esIntegrante(grupoId, usuarioId) {
  const [filas] = await pool.execute(
    `SELECT 1 FROM grupo_integrantes WHERE grupo_id = ? AND usuario_id = ?`,
    [grupoId, usuarioId]
  );
  return filas.length > 0;
}

// LEER

/* Devuelve el grupo activo con ese id, o null si no existe o fue dado de baja. */
async function buscarPorId(grupoId) {
  const [filas] = await pool.execute(
    `SELECT id, nombre, descripcion, fecha_creacion
       FROM grupos
      WHERE id = ? AND activo = 1`,
    [grupoId]
  );
  return filas[0] ?? null;
}

/* Las personas de un grupo, con sus datos básicos.*/
async function buscarIntegrantes(grupoId) {
  const [filas] = await pool.execute(
    `SELECT u.id, u.nombre, u.apellido, r.codigo AS rol, gi.es_responsable, gi.fecha_alta
       FROM grupo_integrantes gi
       JOIN usuarios u ON u.id = gi.usuario_id
       JOIN roles r    ON r.id = u.id_rol
      WHERE gi.grupo_id = ?
      ORDER BY u.nombre, u.apellido`,
    [grupoId]
  );
  return filas;
}

/**
 * Listado paginado de grupos activos.
 * @param soloDelUsuario  si viene un id, trae solo los grupos donde está esa persona
 * @param buscar          texto a buscar en el nombre 
 * @returns { grupos, total }  total = cuántos hay en total 
 */
async function listar({ soloDelUsuario, buscar, limite, offset }) {
  
  const condiciones = ['g.activo = 1'];
  const parametros = [];

  if (buscar) {
    condiciones.push('g.nombre LIKE ?');
    //para que si alguien busca "50%" no se tome como comodín
    parametros.push(`%${buscar.replace(/[\\%_]/g, '\\$&')}%`);
  }

  if (soloDelUsuario) {
    condiciones.push(
      'EXISTS (SELECT 1 FROM grupo_integrantes x WHERE x.grupo_id = g.id AND x.usuario_id = ?)'
    );
    parametros.push(soloDelUsuario);
  }

  const where = condiciones.join(' AND ');

  //se usa pool.query porque pool.execute da problemas con LIMIT ? en MySQL 8
  const [grupos] = await pool.query(
    `SELECT g.id, g.nombre, g.descripcion,
            COUNT(gi.usuario_id) AS cantidad_integrantes
       FROM grupos g
       LEFT JOIN grupo_integrantes gi ON gi.grupo_id = g.id
      WHERE ${where}
      GROUP BY g.id
      ORDER BY g.nombre
      LIMIT ? OFFSET ?`,
    [...parametros, limite, offset]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM grupos g WHERE ${where}`,
    parametros
  );

  return { grupos, total };
}

//CREAR

/* Arma las filas [grupo_id, usuario_id, es_responsable] para insertar. */
function armarFilasIntegrantes(grupoId, responsables, integrantes) {
  return [
    ...responsables.map((id) => [grupoId, id, 1]),
    ...integrantes.map((id) => [grupoId, id, 0]),
  ];
}

/* Crea el grupo y sus integrantes en UNA transacción: 
o se guarda todo, o no se guarda nada. */
async function crear({ nombre, descripcion, creadoPor, responsables, integrantes }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [resultado] = await conn.execute(
      `INSERT INTO grupos (nombre, descripcion, creado_por) VALUES (?, ?, ?)`,
      [nombre, descripcion ?? null, creadoPor]
    );
    const grupoId = resultado.insertId;

    // "VALUES ?" con un array de arrays inserta todas las filas de una vez
    await conn.query(
      `INSERT INTO grupo_integrantes (grupo_id, usuario_id, es_responsable) VALUES ?`,
      [armarFilasIntegrantes(grupoId, responsables, integrantes)]
    );

    await conn.commit();
    return grupoId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/* Deja el grupo EXACTAMENTE como viene: nombre, descripción, responsables e integrantes.
 Devuelve { agregados } con los IDs de las personas que NO estaban antes en el grupo, o null si el grupo ya no existe. */
async function actualizar(grupoId, { nombre, descripcion, responsables, integrantes }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Bloquear la fila del grupo: si otra persona lo edita al mismo tiempo, espera a que esta transacción termine (no se pisan los cambios).
    const [grupo] = await conn.execute(
      `SELECT id FROM grupos WHERE id = ? AND activo = 1 FOR UPDATE`,
      [grupoId]
    );
    if (grupo.length === 0) {
      await conn.rollback();
      return null;
    }

    const [actuales] = await conn.execute(
      `SELECT usuario_id FROM grupo_integrantes WHERE grupo_id = ?`,
      [grupoId]
    );
    const idsActuales = new Set(actuales.map((fila) => fila.usuario_id));

    // 2. Datos del grupo
    await conn.execute(
      `UPDATE grupos SET nombre = ?, descripcion = ? WHERE id = ?`,
      [nombre, descripcion ?? null, grupoId]
    );

    // 3. Sacar a los que ya no están en ninguna de las dos listas
    const todosLosIds = [...responsables, ...integrantes]; // nunca vacía: hay mínimo 1 responsable
    await conn.query(
      `DELETE FROM grupo_integrantes WHERE grupo_id = ? AND usuario_id NOT IN (?)`,
      [grupoId, todosLosIds]
    );

    /* 4. Agregar a los nuevos y actualizar si es responsable o no a los que ya estaban.
    ON DUPLICATE KEY UPDATE: si la fila (grupo_id, usuario_id) ya existe,
    en vez de dar error solo cambia es_responsable. Así no se pierde su fecha_alta.*/
    await conn.query(
      `INSERT INTO grupo_integrantes (grupo_id, usuario_id, es_responsable)
       VALUES ?
       ON DUPLICATE KEY UPDATE es_responsable = VALUES(es_responsable)`,
      [armarFilasIntegrantes(grupoId, responsables, integrantes)]
    );

    await conn.commit();

    // Los que están ahora y no estaban antes
    const agregados = todosLosIds.filter((id) => !idsActuales.has(id));
    return { agregados };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// BORRAR

/*
 Baja lógica: el grupo deja de aparecer, pero sigue en la base.
 Devuelve true si lo dio de baja, false si no existía o ya estaba dado de baja.
 */
async function darDeBaja(grupoId) {
  const [resultado] = await pool.execute(
    `UPDATE grupos SET activo = 0 WHERE id = ? AND activo = 1`,
    [grupoId]
  );
  return resultado.affectedRows > 0;
}



module.exports = {
  buscarUsuariosConRol,
  esResponsable,
  esIntegrante,
  buscarPorId,
  buscarIntegrantes,
  listar,
  crear,
  actualizar,
  darDeBaja,
};