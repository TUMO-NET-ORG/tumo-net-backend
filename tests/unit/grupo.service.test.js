jest.mock('../../src/server/v1/repositories/grupo.repository');

const grupoRepository = require('../../src/server/v1/repositories/grupo.repository');
const {
  listarGrupos,
  obtenerGrupo,
  crearGrupo,
  editarGrupo,
  borrarGrupo,
} = require('../../src/server/v1/services/grupo.service');

const USUARIOS = [
  { id: 1, rol: 'administrador', estado: 'activo' },
  { id: 2, rol: 'tutor', estado: 'activo' },
  { id: 3, rol: 'alumno', estado: 'activo' },
  { id: 4, rol: 'alumno', estado: 'dado_de_baja' },
  { id: 5, rol: 'staff', estado: 'dado_de_baja' },
];

function datosGrupo(cambios = {}) {
  return {
    nombre: 'Taller de robótica',
    descripcion: 'Turno mañana',
    responsables: [2],
    integrantes: [3],
    ...cambios,
  };
}

describe('crearGrupo', () => {
  beforeEach(() => {
    grupoRepository.buscarUsuariosConRol.mockImplementation(async (ids) =>
      USUARIOS.filter((u) => ids.includes(u.id)),
    );
    grupoRepository.crear.mockResolvedValue(10);
  });

  test('crea el grupo y lo devuelve', async () => {
    const grupo = await crearGrupo(datosGrupo(), 1);

    expect(grupoRepository.crear).toHaveBeenCalledWith({
      nombre: 'Taller de robótica',
      descripcion: 'Turno mañana',
      creadoPor: 1,
      responsables: [2],
      integrantes: [3],
    });
    expect(grupo).toEqual({
      id: 10,
      nombre: 'Taller de robótica',
      descripcion: 'Turno mañana',
      responsables: [2],
      integrantes: [3],
    });
  });

  test('el creador no tiene que ser responsable del grupo', async () => {
    await expect(crearGrupo(datosGrupo({ responsables: [2] }), 1)).resolves.toMatchObject({
      responsables: [2],
    });
  });

  test('acepta un grupo sin descripción', async () => {
    const grupo = await crearGrupo(datosGrupo({ descripcion: undefined }), 1);
    expect(grupo.descripcion).toBeNull();
  });

  test('si una persona viene en las dos listas, queda solo como responsable', async () => {
    const grupo = await crearGrupo(datosGrupo({ responsables: [2], integrantes: [2, 3] }), 1);

    expect(grupo).toMatchObject({ responsables: [2], integrantes: [3] });
    expect(grupoRepository.crear).toHaveBeenCalledWith(
      expect.objectContaining({ responsables: [2], integrantes: [3] }),
    );
  });

  test('si no mandan responsables, el responsable es quien crea el grupo', async () => {
    const grupo = await crearGrupo(datosGrupo({ responsables: undefined }), 1);
    expect(grupo.responsables).toEqual([1]);
  });

  test('rechaza usuarios inexistentes', async () => {
    await expect(
      crearGrupo(datosGrupo({ integrantes: [3, 99] }), 1),
    ).rejects.toMatchObject({ statusCode: 400, code: 'USUARIOS_INEXISTENTES' });
  });

  test('rechaza integrantes dados de baja', async () => {
    await expect(
      crearGrupo(datosGrupo({ integrantes: [3, 4] }), 1),
    ).rejects.toMatchObject({ statusCode: 400, code: 'USUARIOS_DADOS_DE_BAJA' });
    expect(grupoRepository.crear).not.toHaveBeenCalled();
  });

  test('rechaza responsables dados de baja', async () => {
    await expect(
      crearGrupo(datosGrupo({ responsables: [5] }), 1),
    ).rejects.toMatchObject({ statusCode: 400, code: 'USUARIOS_DADOS_DE_BAJA' });
  });

  test('rechaza responsables sin rol staff, tutor o administrador', async () => {
    await expect(
      crearGrupo(datosGrupo({ responsables: [3], integrantes: [] }), 1),
    ).rejects.toMatchObject({ statusCode: 400, code: 'RESPONSABLE_ROL_INVALIDO' });
  });

  test('responde 409 si ya existe un grupo con ese nombre', async () => {
    const error = new Error('Duplicate entry');
    error.code = 'ER_DUP_ENTRY';
    grupoRepository.crear.mockRejectedValue(error);

    await expect(crearGrupo(datosGrupo(), 1)).rejects.toMatchObject({
      statusCode: 409,
      code: 'GRUPO_YA_EXISTE',
    });
  });
});

const ADMIN = { id: 1, rol: 'administrador' };
const TUTOR = { id: 2, rol: 'tutor' };
const ALUMNO = { id: 3, rol: 'alumno' };
const GRUPO = { id: 10, nombre: 'Taller de robótica', descripcion: 'Turno mañana' };

function mockUsuarios() {
  grupoRepository.buscarUsuariosConRol.mockImplementation(async (ids) =>
    USUARIOS.filter((u) => ids.includes(u.id)),
  );
}

describe('listarGrupos', () => {
  beforeEach(() => {
    grupoRepository.listar.mockResolvedValue({ grupos: [GRUPO], total: 45 });
  });

  test.each([ADMIN, { id: 100, rol: 'superadmin' }])('un $rol ve todos los grupos', async (usuario) => {
    await listarGrupos({ pagina: 1, limite: 20 }, usuario);

    expect(grupoRepository.listar).toHaveBeenCalledWith(
      expect.objectContaining({ soloDelUsuario: null }),
    );
  });

  test.each([TUTOR, ALUMNO])('un $rol solo ve los grupos donde está', async (usuario) => {
    await listarGrupos({ pagina: 1, limite: 20 }, usuario);

    expect(grupoRepository.listar).toHaveBeenCalledWith(
      expect.objectContaining({ soloDelUsuario: usuario.id }),
    );
  });

  test('calcula el offset y la paginación', async () => {
    const resultado = await listarGrupos({ pagina: 3, limite: 20, buscar: 'robo' }, ADMIN);

    expect(grupoRepository.listar).toHaveBeenCalledWith({
      soloDelUsuario: null,
      buscar: 'robo',
      limite: 20,
      offset: 40,
    });
    expect(resultado).toEqual({
      grupos: [GRUPO],
      paginacion: { pagina: 3, limite: 20, total: 45, totalPaginas: 3 },
    });
  });

  test('sin grupos devuelve 0 páginas', async () => {
    grupoRepository.listar.mockResolvedValue({ grupos: [], total: 0 });

    const resultado = await listarGrupos({ pagina: 1, limite: 20 }, ADMIN);

    expect(resultado.paginacion).toMatchObject({ total: 0, totalPaginas: 0 });
  });
});

describe('obtenerGrupo', () => {
  beforeEach(() => {
    grupoRepository.buscarPorId.mockResolvedValue(GRUPO);
    grupoRepository.esIntegrante.mockResolvedValue(true);
    grupoRepository.buscarIntegrantes.mockResolvedValue([
      { id: 2, nombre: 'Ana', apellido: 'Tutor', rol: 'tutor', es_responsable: 1 },
      { id: 3, nombre: 'Beto', apellido: 'Alumno', rol: 'alumno', es_responsable: 0 },
    ]);
  });

  test('separa responsables e integrantes y saca la marca es_responsable', async () => {
    const grupo = await obtenerGrupo(10, ALUMNO);

    expect(grupo).toEqual({
      ...GRUPO,
      responsables: [{ id: 2, nombre: 'Ana', apellido: 'Tutor', rol: 'tutor' }],
      integrantes: [{ id: 3, nombre: 'Beto', apellido: 'Alumno', rol: 'alumno' }],
    });
  });

  test('un administrador ve cualquier grupo sin ser integrante', async () => {
    await obtenerGrupo(10, ADMIN);

    expect(grupoRepository.esIntegrante).not.toHaveBeenCalled();
  });

  test('responde 403 si el usuario no está en el grupo', async () => {
    grupoRepository.esIntegrante.mockResolvedValue(false);

    await expect(obtenerGrupo(10, ALUMNO)).rejects.toMatchObject({
      statusCode: 403,
      code: 'SIN_PERMISO_GRUPO',
    });
    expect(grupoRepository.buscarIntegrantes).not.toHaveBeenCalled();
  });

  test('responde 404 si el grupo no existe o fue dado de baja', async () => {
    grupoRepository.buscarPorId.mockResolvedValue(null);

    await expect(obtenerGrupo(10, ADMIN)).rejects.toMatchObject({
      statusCode: 404,
      code: 'GRUPO_NO_ENCONTRADO',
    });
  });
});

describe('editarGrupo', () => {
  beforeEach(() => {
    mockUsuarios();
    grupoRepository.buscarPorId.mockResolvedValue(GRUPO);
    grupoRepository.esResponsable.mockResolvedValue(true);
    grupoRepository.actualizar.mockResolvedValue({ agregados: [3] });
  });

  test('un responsable edita el grupo y lo devuelve como quedó', async () => {
    const grupo = await editarGrupo(10, datosGrupo({ nombre: 'Nuevo nombre' }), TUTOR);

    expect(grupoRepository.esResponsable).toHaveBeenCalledWith(10, 2);
    expect(grupoRepository.actualizar).toHaveBeenCalledWith(10, {
      nombre: 'Nuevo nombre',
      descripcion: 'Turno mañana',
      responsables: [2],
      integrantes: [3],
    });
    expect(grupo).toEqual({
      id: 10,
      nombre: 'Nuevo nombre',
      descripcion: 'Turno mañana',
      responsables: [2],
      integrantes: [3],
    });
  });

  test.each([ADMIN, { id: 100, rol: 'superadmin' }])('un $rol edita cualquier grupo sin ser responsable', async (usuario) => {
    await editarGrupo(10, datosGrupo(), usuario);

    expect(grupoRepository.esResponsable).not.toHaveBeenCalled();
    expect(grupoRepository.actualizar).toHaveBeenCalled();
  });

  test('responde 403 si no es responsable del grupo', async () => {
    grupoRepository.esResponsable.mockResolvedValue(false);

    await expect(editarGrupo(10, datosGrupo(), TUTOR)).rejects.toMatchObject({
      statusCode: 403,
      code: 'SIN_PERMISO_GRUPO',
    });
    expect(grupoRepository.actualizar).not.toHaveBeenCalled();
  });

  test('responde 404 si el grupo no existe', async () => {
    grupoRepository.buscarPorId.mockResolvedValue(null);

    await expect(editarGrupo(10, datosGrupo(), ADMIN)).rejects.toMatchObject({
      statusCode: 404,
      code: 'GRUPO_NO_ENCONTRADO',
    });
    expect(grupoRepository.actualizar).not.toHaveBeenCalled();
  });

  test('responde 404 si lo dieron de baja mientras se editaba', async () => {
    grupoRepository.actualizar.mockResolvedValue(null);

    await expect(editarGrupo(10, datosGrupo(), ADMIN)).rejects.toMatchObject({
      statusCode: 404,
      code: 'GRUPO_NO_ENCONTRADO',
    });
  });

  test.each([
    ['un usuario inexistente', { integrantes: [99] }, 'USUARIOS_INEXISTENTES'],
    ['un alumno como responsable', { responsables: [3], integrantes: [] }, 'RESPONSABLE_ROL_INVALIDO'],
  ])('aplica las mismas reglas que al crear: rechaza %s', async (_caso, cambios, codigo) => {
    await expect(editarGrupo(10, datosGrupo(cambios), ADMIN)).rejects.toMatchObject({
      statusCode: 400,
      code: codigo,
    });
    expect(grupoRepository.actualizar).not.toHaveBeenCalled();
  });

  test('saca a los dados de baja sin dar error', async () => {
    const grupo = await editarGrupo(
      10,
      datosGrupo({ responsables: [2, 5], integrantes: [3, 4] }),
      ADMIN,
    );

    expect(grupoRepository.actualizar).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ responsables: [2], integrantes: [3] }),
    );
    expect(grupo).toMatchObject({ responsables: [2], integrantes: [3] });
  });

  test('si todos los responsables están dados de baja responde 400', async () => {
    await expect(
      editarGrupo(10, datosGrupo({ responsables: [5] }), ADMIN),
    ).rejects.toMatchObject({ statusCode: 400, code: 'GRUPO_SIN_RESPONSABLES' });
    expect(grupoRepository.actualizar).not.toHaveBeenCalled();
  });

  test('si una persona viene en las dos listas, queda solo como responsable', async () => {
    await editarGrupo(10, datosGrupo({ integrantes: [2, 3] }), ADMIN);

    expect(grupoRepository.actualizar).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ responsables: [2], integrantes: [3] }),
    );
  });

  test('responde 409 si el nuevo nombre ya lo usa otro grupo', async () => {
    const error = new Error('Duplicate entry');
    error.code = 'ER_DUP_ENTRY';
    grupoRepository.actualizar.mockRejectedValue(error);

    await expect(editarGrupo(10, datosGrupo(), ADMIN)).rejects.toMatchObject({
      statusCode: 409,
      code: 'GRUPO_YA_EXISTE',
    });
  });

  test('cualquier otro error de la base se propaga sin cambios', async () => {
    const error = new Error('Conexión perdida');
    grupoRepository.actualizar.mockRejectedValue(error);

    await expect(editarGrupo(10, datosGrupo(), ADMIN)).rejects.toBe(error);
  });
});

describe('borrarGrupo', () => {
  beforeEach(() => {
    grupoRepository.buscarPorId.mockResolvedValue(GRUPO);
    grupoRepository.esResponsable.mockResolvedValue(true);
    grupoRepository.darDeBaja.mockResolvedValue(true);
  });

  test('un responsable da de baja el grupo', async () => {
    await expect(borrarGrupo(10, TUTOR)).resolves.toBeUndefined();

    expect(grupoRepository.esResponsable).toHaveBeenCalledWith(10, 2);
    expect(grupoRepository.darDeBaja).toHaveBeenCalledWith(10);
  });

  test('un administrador borra cualquier grupo sin ser responsable', async () => {
    await borrarGrupo(10, ADMIN);

    expect(grupoRepository.esResponsable).not.toHaveBeenCalled();
    expect(grupoRepository.darDeBaja).toHaveBeenCalledWith(10);
  });

  test('responde 403 si no es responsable del grupo', async () => {
    grupoRepository.esResponsable.mockResolvedValue(false);

    await expect(borrarGrupo(10, TUTOR)).rejects.toMatchObject({
      statusCode: 403,
      code: 'SIN_PERMISO_GRUPO',
    });
    expect(grupoRepository.darDeBaja).not.toHaveBeenCalled();
  });

  test('responde 404 si el grupo no existe', async () => {
    grupoRepository.buscarPorId.mockResolvedValue(null);

    await expect(borrarGrupo(10, ADMIN)).rejects.toMatchObject({
      statusCode: 404,
      code: 'GRUPO_NO_ENCONTRADO',
    });
  });

  test('responde 404 si alguien lo borró justo antes', async () => {
    grupoRepository.darDeBaja.mockResolvedValue(false);

    await expect(borrarGrupo(10, ADMIN)).rejects.toMatchObject({
      statusCode: 404,
      code: 'GRUPO_NO_ENCONTRADO',
    });
  });
});
