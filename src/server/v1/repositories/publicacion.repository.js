const pool = require('../../../config/db');

async function listarDisciplinas() {
  const [filas] = await pool.execute(
    'SELECT id, codigo, nombre FROM disciplinas ORDER BY nombre',
  );
  return filas;
}

async function buscarDisciplina(disciplinaId) {
  const [filas] = await pool.execute(
    'SELECT id, codigo, nombre FROM disciplinas WHERE id = ?',
    [disciplinaId],
  );
  return filas[0] ?? null;
}

async function listar({ pagina, limite, disciplina }) {
  const condiciones = ['p.activo = 1'];
  const parametros = [];

  if (disciplina) {
    condiciones.push('d.codigo = ?');
    parametros.push(disciplina);
  }

  const where = condiciones.join(' AND ');
  const offset = (pagina - 1) * limite;

  const [publicaciones] = await pool.query(
    `SELECT p.id, p.usuario_id, p.texto, p.enlace_url, p.fecha_creacion,
            u.nombre AS autor_nombre, u.apellido AS autor_apellido,
            d.id AS disciplina_id, d.codigo AS disciplina_codigo,
            d.nombre AS disciplina_nombre
       FROM publicaciones p
       JOIN usuarios u ON u.id = p.usuario_id
       JOIN disciplinas d ON d.id = p.disciplina_id
      WHERE ${where}
      ORDER BY p.fecha_creacion DESC, p.id DESC
      LIMIT ? OFFSET ?`,
    [...parametros, limite, offset],
  );

  if (publicaciones.length === 0) {
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
         FROM publicaciones p
         JOIN disciplinas d ON d.id = p.disciplina_id
        WHERE ${where}`,
      parametros,
    );
    return { publicaciones: [], total };
  }

  const ids = publicaciones.map((publicacion) => publicacion.id);
  const [imagenes] = await pool.query(
    `SELECT id, publicacion_id, nombre_archivo, url, tipo_mime, tamanio
       FROM publicacion_imagenes
      WHERE publicacion_id IN (?)`,
    [ids],
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM publicaciones p
       JOIN disciplinas d ON d.id = p.disciplina_id
      WHERE ${where}`,
    parametros,
  );

  const imagenesPorPublicacion = new Map();
  for (const imagen of imagenes) {
    if (!imagenesPorPublicacion.has(imagen.publicacion_id)) {
      imagenesPorPublicacion.set(imagen.publicacion_id, []);
    }
    imagenesPorPublicacion.get(imagen.publicacion_id).push(imagen);
  }

  return {
    publicaciones: publicaciones.map((publicacion) => ({
      ...publicacion,
      imagenes: imagenesPorPublicacion.get(publicacion.id) || [],
    })),
    total,
  };
}

async function crear({ usuarioId, disciplinaId, texto, enlaceUrl, archivos }) {
  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();
    const [resultado] = await conexion.execute(
      `INSERT INTO publicaciones (usuario_id, disciplina_id, texto, enlace_url)
       VALUES (?, ?, ?, ?)`,
      [usuarioId, disciplinaId, texto, enlaceUrl],
    );
    const publicacionId = resultado.insertId;

    if (archivos.length > 0) {
      await conexion.query(
        `INSERT INTO publicacion_imagenes
         (publicacion_id, nombre_archivo, url, tipo_mime, tamanio)
         VALUES ?`,
        [archivos.map((archivo) => [
          publicacionId,
          archivo.filename,
          `/uploads/publicaciones/${archivo.filename}`,
          archivo.mimetype,
          archivo.size,
        ])],
      );
    }

    await conexion.commit();
    return publicacionId;
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}

async function buscarPorId(publicacionId) {
  const [[publicacion]] = await pool.query(
    `SELECT p.id, p.usuario_id, p.texto, p.enlace_url, p.fecha_creacion,
            d.id AS disciplina_id, d.codigo AS disciplina_codigo, d.nombre AS disciplina_nombre
       FROM publicaciones p
       JOIN disciplinas d ON d.id = p.disciplina_id
      WHERE p.id = ? AND p.activo = 1`,
    [publicacionId],
  );
  if (!publicacion) return null;

  const [imagenes] = await pool.execute(
    `SELECT id, nombre_archivo, url, tipo_mime, tamanio
       FROM publicacion_imagenes
      WHERE publicacion_id = ?
      ORDER BY id`,
    [publicacionId],
  );
  return { ...publicacion, imagenes };
}

module.exports = { listarDisciplinas, buscarDisciplina, listar, crear, buscarPorId };
