
const grupoRepository = require('../repositories/grupo.repository');
const AppError = require('../errors/AppError');

const { ROLES_TRABAJADORES, ROLES_ADMINISTRADORES } = require('../utils/roles');

// Roles que pueden ser responsables de un grupo: todos los trabajadores
const ROLES_RESPONSABLE = ROLES_TRABAJADORES;


/*Si una persona viene en las dos listas, queda SOLO como responsable.
 Así, para pasar a alguien de integrante a responsable no hace falta sacarlo antes de integrantes.*/
function quitarResponsablesDeIntegrantes(responsables, integrantes) {
  return integrantes.filter((id) => !responsables.includes(id));
}


// Reglas sobre quién está en el grupo. Las usan CREAR y EDITAR.
// Devuelve las listas como tienen que guardarse.

async function validarMiembros(responsables, integrantes, { quitarDadosDeBaja = false } = {}) {
  // Regla 1: todos los usuarios tienen que existir
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

  /* Regla 2: un usuario dado de baja no puede estar en un grupo.
   Al crear se rechaza. Al editar se lo saca sin dar error: el front manda el grupo completo
   y puede traer a alguien que se dio de baja mientras el formulario estaba abierto.*/
  const estaDadoDeBaja = (id) => porId.get(id).estado === 'dado_de_baja';
  const dadosDeBaja = todosLosIds.filter(estaDadoDeBaja);
  if (dadosDeBaja.length > 0) {
    if (!quitarDadosDeBaja) {
      throw new AppError(
        400,
        `Estos usuarios están dados de baja: ${dadosDeBaja.join(', ')}`,
        'USUARIOS_DADOS_DE_BAJA'
      );
    }
    responsables = responsables.filter((id) => !estaDadoDeBaja(id));
    integrantes = integrantes.filter((id) => !estaDadoDeBaja(id));
    if (responsables.length === 0) {
      throw new AppError(
        400,
        'El grupo necesita al menos un responsable que no esté dado de baja',
        'GRUPO_SIN_RESPONSABLES'
      );
    }
  }

  // Regla 3: los responsables tienen que ser trabajadores (cualquier rol menos alumno)
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

  return { responsables, integrantes };
}

/* Traduce el error de MySQL por nombre repetido a un 409. */
function traducirErrorNombreRepetido(err) {
  if (err.code === 'ER_DUP_ENTRY') {
    return new AppError(409, 'Ya existe un grupo con ese nombre', 'GRUPO_YA_EXISTE');
  }
  return err; // cualquier otro error 500 en el manejador global
}

/* Trae el grupo o tira 404. */
async function obtenerGrupoOFallar(grupoId) {
  const grupo = await grupoRepository.buscarPorId(grupoId);
  if (!grupo) {
    throw new AppError(404, 'El grupo no existe', 'GRUPO_NO_ENCONTRADO');
  }
  return grupo;
}

/*Permiso para editar o borrar un grupo:
 un administrador o superadmin puede con cualquier grupo; staff y tutor solo con los que son responsables.*/
async function verificarPuedeGestionar(grupoId, usuarioActual) {
  if (ROLES_ADMINISTRADORES.includes(usuarioActual.rol)) return;
  const esResponsable = await grupoRepository.esResponsable(grupoId, usuarioActual.id);
  if (!esResponsable) {
    throw new AppError(403, 'Solo un responsable del grupo puede modificarlo', 'SIN_PERMISO_GRUPO');
  }
}

/*
 Permiso para ver el detalle:
 un administrador o superadmin ve cualquier grupo; el resto, solo los grupos donde está.
 */
async function verificarPuedeVer(grupoId, usuarioActual) {
  if (ROLES_ADMINISTRADORES.includes(usuarioActual.rol)) return;
  const esIntegrante = await grupoRepository.esIntegrante(grupoId, usuarioActual.id);
  if (!esIntegrante) {
    throw new AppError(403, 'No formás parte de este grupo', 'SIN_PERMISO_GRUPO');
  }
}

// LISTAR 

//Un administrador o superadmin ve todos los grupos; el resto, solo los grupos donde está.
 
async function listarGrupos({ pagina, limite, buscar }, usuarioActual) {
  const soloDelUsuario = ROLES_ADMINISTRADORES.includes(usuarioActual.rol) ? null : usuarioActual.id;

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

async function listarUsuariosDisponibles(buscar) {
  return grupoRepository.listarUsuariosDisponibles({ buscar });
}


// CREAR

async function crearGrupo(datos, creadoPorId) {
  const { nombre, descripcion } = datos;

  /* Si no mandan responsables, el responsable es quien crea el grupo.
   Siempre es válido: la ruta ya exige un rol de trabajador.
   Si los mandan, se respetan: quien crea puede no quedar como responsable.*/
  
  const responsablesPedidos = datos.responsables ?? [creadoPorId];
  const { responsables, integrantes } = await validarMiembros(
    responsablesPedidos,
    quitarResponsablesDeIntegrantes(responsablesPedidos, datos.integrantes),
  );

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
async function editarGrupo(grupoId, datos, usuarioActual) {
  const { nombre, descripcion } = datos;

  // 1. El grupo tiene que existir (y no estar dado de baja)
  await obtenerGrupoOFallar(grupoId);

  // 2. Permisos
  await verificarPuedeGestionar(grupoId, usuarioActual);

  // 3. Mismas reglas que al crear, salvo que los dados de baja se sacan en vez de dar error
  const { responsables, integrantes } = await validarMiembros(
    datos.responsables,
    quitarResponsablesDeIntegrantes(datos.responsables, datos.integrantes),
    { quitarDadosDeBaja: true },
  );

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

module.exports = {
  ROLES_RESPONSABLE,
  listarGrupos,
  obtenerGrupo,
  listarUsuariosDisponibles,
  crearGrupo,
  editarGrupo,
  borrarGrupo,
};