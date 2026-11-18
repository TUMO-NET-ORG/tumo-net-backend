jest.mock('../../src/server/v1/repositories/grupo.repository');

const grupoRepository = require('../../src/server/v1/repositories/grupo.repository');
const { crearGrupo } = require('../../src/server/v1/services/grupo.service');

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

  test('rechaza un usuario que es responsable e integrante a la vez', async () => {
    await expect(
      crearGrupo(datosGrupo({ responsables: [2], integrantes: [2, 3] }), 1),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INTEGRANTE_DUPLICADO' });
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
