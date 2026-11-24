const publicacionRepository = require('../repositories/publicacion.repository');
const AppError = require('../errors/AppError');

async function listarDisciplinas() {
  return publicacionRepository.listarDisciplinas();
}

async function listarPublicaciones(datos) {
  const { publicaciones, total } = await publicacionRepository.listar(datos);
  return {
    publicaciones,
    paginacion: {
      pagina: datos.pagina,
      limite: datos.limite,
      total,
      totalPaginas: Math.ceil(total / datos.limite),
    },
  };
}

async function crearPublicacion(datos, usuarioId, archivos) {
  const disciplina = await publicacionRepository.buscarDisciplina(datos.disciplina_id);
  if (!disciplina) {
    throw new AppError(
      400,
      'La disciplina seleccionada no existe',
      'DISCIPLINA_NO_ENCONTRADA',
    );
  }

  const publicacionId = await publicacionRepository.crear({
    usuarioId,
    disciplinaId: disciplina.id,
    texto: datos.texto,
    enlaceUrl: datos.enlace_url || null,
    archivos,
  });
  return publicacionRepository.buscarPorId(publicacionId);
}

module.exports = { listarDisciplinas, listarPublicaciones, crearPublicacion };
