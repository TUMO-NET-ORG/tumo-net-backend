
const grupoRepository = require('../repositories/grupo.repository');
const AppError = require('../errors/AppError');

const ROLES_RESPONSABLE = ['staff', 'tutor', 'administrador'];

async function crearGrupo({ nombre, descripcion, responsables, integrantes }, creadoPorId) {
  // Regla 1: una persona no puede estar en las dos listas a la vez
  const enAmbas = responsables.filter((id) => integrantes.includes(id));
  if (enAmbas.length > 0) {
    throw new AppError(
      400,
      `Estos usuarios están como responsables y como integrantes: ${enAmbas.join(', ')}`,
      'INTEGRANTE_DUPLICADO'
    );
  }

  // Regla 2: todos los usuarios tienen que existir
  const todosLosIds = [...responsables, ...integrantes];
  const usuarios = await grupoRepository.buscarUsuariosConRol(todosLosIds);
  const porId = new Map(usuarios.map((u) => [u.id, u])); 

  const inexistentes = todosLosIds.filter((id) => !porId.has(id));
  if (inexistentes.length > 0) {
    throw new AppError(
      400,
      `Estos usuarios no existen: ${inexistentes.join(', ')}`,
      'USUARIOS_INEXISTENTES'
    );
  }

  // Regla 3: no se puede agregar a un grupo a un usuario dado de baja
  const dadosDeBaja = todosLosIds.filter((id) => porId.get(id).estado === 'dado_de_baja');
  if (dadosDeBaja.length > 0) {
    throw new AppError(
      400,
      `Estos usuarios están dados de baja: ${dadosDeBaja.join(', ')}`,
      'USUARIOS_DADOS_DE_BAJA'
    );
  }

  // Regla 4: los responsables tienen que ser staff, tutor o administrador
  const sinRolValido = responsables.filter(
    (id) => !ROLES_RESPONSABLE.includes(porId.get(id).rol)
  );
  if (sinRolValido.length > 0) {
    throw new AppError(
      400,
      `Estos usuarios no pueden ser responsables (requiere rol ${ROLES_RESPONSABLE.join(', ')}): ${sinRolValido.join(', ')}`,
      'RESPONSABLE_ROL_INVALIDO'
    );
  }

  // Guardar
  let grupoId;
  try {
    grupoId = await grupoRepository.crear({
      nombre,
      descripcion,
      creadoPor: creadoPorId,
      responsables,
      integrantes,
    });
  } catch (err) {
    // El UNIQUE de nombre en la tabla grupos
    if (err.code === 'ER_DUP_ENTRY') {
      throw new AppError(409, 'Ya existe un grupo con ese nombre', 'GRUPO_YA_EXISTE');
    }
    throw err;
  }

  return { id: grupoId, nombre, descripcion: descripcion ?? null, responsables, integrantes };
}

module.exports = { crearGrupo };