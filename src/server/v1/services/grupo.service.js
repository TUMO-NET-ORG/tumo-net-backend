
const grupoRepository = require('../repositories/grupo.repository');
const AppError = require('../errors/AppError');

// Roles que pueden ser responsables de un grupo 
const ROLES_RESPONSABLE = ['staff', 'tutor', 'administrador'];



// Reglas sobre quién está en el grupo. Las usan CREAR y EDITAR.

async function validarMiembros(responsables, integrantes) {
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
  const porId = new Map(usuarios.map((u) => [u.id, u])); // id -> { id, rol, estado }

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
}

/* Traduce el error de MySQL por nombre repetido a un 409. */
function traducirErrorNombreRepetido(err) {
  if (err.code === 'ER_DUP_ENTRY') {
    return new AppError(409, 'Ya existe un grupo con ese nombre', 'GRUPO_YA_EXISTE');
  }
  return err; // cualquier otro error -> 500 en el manejador global
}

/* Trae el grupo o tira 404. */
async function obtenerGrupoOFallar(grupoId) {
  const grupo = await grupoRepository.buscarPorId(grupoId);
  if (!grupo) {
    throw new AppError(404, 'El grupo no existe', 'GRUPO_NO_ENCONTRADO');
  }
  return grupo;
}

/*
 Permiso para editar o borrar un grupo:
 un administrador puede con cualquier grupo; staff y tutor solo con los que son responsables.
 */
async function verificarPuedeGestionar(grupoId, usuarioActual) {
  if (usuarioActual.rol === 'administrador') return;
  const esResponsable = await grupoRepository.esResponsable(grupoId, usuarioActual.id);
  if (!esResponsable) {
    throw new AppError(403, 'Solo un responsable del grupo puede modificarlo', 'SIN_PERMISO_GRUPO');
  }
}

/*
 Permiso para ver el detalle:
 un administrador ve cualquier grupo; el resto, solo los grupos donde está.
 */
async function verificarPuedeVer(grupoId, usuarioActual) {
  if (usuarioActual.rol === 'administrador') return;
  const esIntegrante = await grupoRepository.esIntegrante(grupoId, usuarioActual.id);
  if (!esIntegrante) {
    throw new AppError(403, 'No formás parte de este grupo', 'SIN_PERMISO_GRUPO');
  }
}

// LISTAR 

//Un administrador ve todos los grupos; el resto, solo los grupos donde está.
 
async function listarGrupos({ pagina, limite, buscar }, usuarioActual) {
  const soloDelUsuario = usuarioActual.rol === 'administrador' ? null : usuarioActual.id;

  const { grupos, total } = await grupoRepository.listar({
    soloDelUsuario,
    buscar,
    limite,
    offset: (pagina - 1) * limite, // página 1 -> salta 0, página 2 -> salta 20, etc.
  });

  return {
    grupos,
    paginacion: {
      pagina,
      limite,
      total,
      totalPaginas: Math.ceil(total / limite),
    },
  };
}

// DETALLE

async function obtenerGrupo(grupoId, usuarioActual) {
  const grupo = await obtenerGrupoOFallar(grupoId);
  await verificarPuedeVer(grupoId, usuarioActual);

  const personas = await grupoRepository.buscarIntegrantes(grupoId);

  
  const sinMarca = ({ es_responsable, ...persona }) => persona;
  return {
    ...grupo,
    responsables: personas.filter((p) => p.es_responsable).map(sinMarca),
    integrantes: personas.filter((p) => !p.es_responsable).map(sinMarca),
  };
}

// CREAR

async function crearGrupo({ nombre, descripcion, responsables, integrantes }, creadoPorId) {
  await validarMiembros(responsables, integrantes);

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
    throw traducirErrorNombreRepetido(err);
  }

  return { id: grupoId, nombre, descripcion: descripcion ?? null, responsables, integrantes };
}

// EDITAR

/**
 * @param grupoId       el :id de la URL
 * @param datos         el grupo completo como tiene que quedar
 * @param usuarioActual req.usuario (quién está haciendo el cambio)
 */
async function editarGrupo(grupoId, { nombre, descripcion, responsables, integrantes }, usuarioActual) {
  // 1. El grupo tiene que existir (y no estar dado de baja)
  await obtenerGrupoOFallar(grupoId);

  // 2. Permisos
  await verificarPuedeGestionar(grupoId, usuarioActual);

  // 3. Mismas reglas que al crear
  await validarMiembros(responsables, integrantes);

  // 4. Guardar
  let resultado;
  try {
    resultado = await grupoRepository.actualizar(grupoId, {
      nombre,
      descripcion,
      responsables,
      integrantes,
    });
  } catch (err) {
    throw traducirErrorNombreRepetido(err);
  }
  if (!resultado) {
    // Lo dieron de baja entre el paso 1 y el 4
    throw new AppError(404, 'El grupo no existe', 'GRUPO_NO_ENCONTRADO');
  }

  // 5. Acá van a ir las notificaciones, DESPUÉS de guardar (el commit ya se hizo).
  //    resultado.agregados tiene solo a los que entraron al grupo con este cambio.
  //    TODO: notificarAgregadosAGrupo(grupoId, resultado.agregados);
  //    Si la notificación falla, NO se deshace la edición del grupo.

  return { id: grupoId, nombre, descripcion: descripcion ?? null, responsables, integrantes };
}

// BORRAR 

async function borrarGrupo(grupoId, usuarioActual) {
  await obtenerGrupoOFallar(grupoId);
  await verificarPuedeGestionar(grupoId, usuarioActual);

  const dadoDeBaja = await grupoRepository.darDeBaja(grupoId);
  if (!dadoDeBaja) {
    // Alguien lo borró justo antes
    throw new AppError(404, 'El grupo no existe', 'GRUPO_NO_ENCONTRADO');
  }
}

module.exports = { listarGrupos, obtenerGrupo, crearGrupo, editarGrupo, borrarGrupo };