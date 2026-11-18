
const pool = require('../../../config/db');

/*El service lo usa para chequear que existan, que no estén dados de baja
  y que los responsables tengan el rol correcto.*/
async function buscarUsuariosConRol(ids) {
  if (ids.length === 0) return [];
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

/*Crea el grupo y sus integrantes en UNA transacción: o se guarda todo, o no se guarda nada (no quedan grupos sin responsables a medias).
 */
async function crear({ nombre, descripcion, creadoPor, responsables, integrantes }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [resultado] = await conn.execute(
      `INSERT INTO grupos (nombre, descripcion, creado_por) VALUES (?, ?, ?)`,
      [nombre, descripcion ?? null, creadoPor]
    );
    const grupoId = resultado.insertId;

    // Una fila por persona: [grupo_id, usuario_id, es_responsable]
    const filas = [
      ...responsables.map((id) => [grupoId, id, 1]),
      ...integrantes.map((id) => [grupoId, id, 0]),
    ];
    // "VALUES ?" con un array de arrays inserta todas las filas de una vez
    await conn.query(
      `INSERT INTO grupo_integrantes (grupo_id, usuario_id, es_responsable) VALUES ?`,
      [filas]
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

module.exports = { buscarUsuariosConRol, crear };