// Verifica el SQL y las transacciones del repositorio de grupos sin una base
// real: se reemplaza el pool de mysql2.
jest.mock('../../src/config/db', () => ({
  query: jest.fn(),
  execute: jest.fn(),
  getConnection: jest.fn(),
}));

const pool = require('../../src/config/db');
const grupoRepository = require('../../src/server/v1/repositories/grupo.repository');

function mockConexion() {
  const conn = {
    beginTransaction: jest.fn().mockResolvedValue(),
    execute: jest.fn(),
    query: jest.fn().mockResolvedValue([{}]),
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    release: jest.fn(),
  };
  pool.getConnection.mockResolvedValue(conn);
  return conn;
}

describe('buscarUsuariosConRol', () => {
  test('con una lista vacía no consulta la base', async () => {
    await expect(grupoRepository.buscarUsuariosConRol([])).resolves.toEqual([]);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('trae rol y estado de cada usuario', async () => {
    const filas = [{ id: 2, rol: 'tutor', estado: 'activo' }];
    pool.query.mockResolvedValue([filas]);

    await expect(grupoRepository.buscarUsuariosConRol([2, 3])).resolves.toEqual(filas);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('r.id = u.id_rol');
    expect(sql).toContain('e.id = u.id_estado');
    expect(sql).toContain('e.codigo AS estado');
    expect(params).toEqual([[2, 3]]);
  });
});

describe('buscarPorId', () => {
  test('devuelve el grupo activo', async () => {
    const grupo = { id: 10, nombre: 'Taller' };
    pool.execute.mockResolvedValue([[grupo]]);

    await expect(grupoRepository.buscarPorId(10)).resolves.toEqual(grupo);

    const [sql, params] = pool.execute.mock.calls[0];
    expect(sql).toContain('activo = 1');
    expect(params).toEqual([10]);
  });

  test('devuelve null si no existe o está dado de baja', async () => {
    pool.execute.mockResolvedValue([[]]);

    await expect(grupoRepository.buscarPorId(10)).resolves.toBeNull();
  });
});

describe('esResponsable / esIntegrante', () => {
  test.each([
    ['esResponsable', [{ 1: 1 }], true],
    ['esResponsable', [], false],
    ['esIntegrante', [{ 1: 1 }], true],
    ['esIntegrante', [], false],
  ])('%s devuelve %p según haya filas', async (funcion, filas, esperado) => {
    pool.execute.mockResolvedValue([filas]);

    await expect(grupoRepository[funcion](10, 2)).resolves.toBe(esperado);
    expect(pool.execute.mock.calls[0][1]).toEqual([10, 2]);
  });

  test('esResponsable filtra por es_responsable = 1', async () => {
    pool.execute.mockResolvedValue([[]]);

    await grupoRepository.esResponsable(10, 2);

    expect(pool.execute.mock.calls[0][0]).toContain('es_responsable = 1');
  });
});

describe('buscarIntegrantes', () => {
  test('trae las personas del grupo con su rol', async () => {
    pool.execute.mockResolvedValue([[{ id: 2, es_responsable: 1 }]]);

    await grupoRepository.buscarIntegrantes(10);

    const [sql, params] = pool.execute.mock.calls[0];
    expect(sql).toContain('r.id = u.id_rol');
    expect(params).toEqual([10]);
  });
});

describe('listar', () => {
  function prepararRespuestas(grupos = [{ id: 10 }], total = 1) {
    pool.query.mockResolvedValueOnce([grupos]).mockResolvedValueOnce([[{ total }]]);
  }

  const consultaListado = () => pool.query.mock.calls[0];
  const consultaConteo = () => pool.query.mock.calls[1];

  test('sin filtros trae solo los grupos activos', async () => {
    prepararRespuestas();

    const resultado = await grupoRepository.listar({ limite: 20, offset: 0 });

    expect(resultado).toEqual({ grupos: [{ id: 10 }], total: 1 });
    const [sqlListado, paramsListado] = consultaListado();
    const [sqlConteo, paramsConteo] = consultaConteo();
    expect(sqlListado).toContain('g.activo = 1');
    expect(sqlConteo).toContain('g.activo = 1');
    expect(sqlListado).not.toContain('EXISTS');
    expect(paramsListado).toEqual([20, 0]);
    expect(paramsConteo).toEqual([]);
  });

  test('con soloDelUsuario filtra los grupos donde está esa persona', async () => {
    prepararRespuestas();

    await grupoRepository.listar({ soloDelUsuario: 3, limite: 20, offset: 40 });

    const [sql, params] = consultaListado();
    expect(sql).toContain('EXISTS');
    expect(params).toEqual([3, 20, 40]);
    expect(consultaConteo()[1]).toEqual([3]);
  });

  test('busca por nombre escapando los comodines de LIKE', async () => {
    prepararRespuestas();

    await grupoRepository.listar({ buscar: '50%_off', limite: 20, offset: 0 });

    const [sql, params] = consultaListado();
    expect(sql).toContain('g.nombre LIKE ?');
    expect(params).toEqual(['%50\\%\\_off%', 20, 0]);
  });

  test('combina búsqueda y usuario en el orden de los parámetros', async () => {
    prepararRespuestas();

    await grupoRepository.listar({ buscar: 'robo', soloDelUsuario: 3, limite: 5, offset: 0 });

    expect(consultaListado()[1]).toEqual(['%robo%', 3, 5, 0]);
    expect(consultaConteo()[1]).toEqual(['%robo%', 3]);
  });
});

describe('crear', () => {
  test('inserta el grupo y sus personas en una transacción', async () => {
    const conn = mockConexion();
    conn.execute.mockResolvedValue([{ insertId: 10 }]);

    const id = await grupoRepository.crear({
      nombre: 'Taller',
      descripcion: undefined,
      creadoPor: 1,
      responsables: [2],
      integrantes: [3, 4],
    });

    expect(id).toBe(10);
    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(conn.execute.mock.calls[0][1]).toEqual(['Taller', null, 1]);
    expect(conn.query.mock.calls[0][1]).toEqual([
      [
        [10, 2, 1],
        [10, 3, 0],
        [10, 4, 0],
      ],
    ]);
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.rollback).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  test('si falla un insert hace rollback, libera la conexión y propaga el error', async () => {
    const conn = mockConexion();
    const error = new Error('Duplicate entry');
    error.code = 'ER_DUP_ENTRY';
    conn.execute.mockRejectedValue(error);

    await expect(
      grupoRepository.crear({ nombre: 'Taller', creadoPor: 1, responsables: [2], integrantes: [] }),
    ).rejects.toBe(error);

    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });
});

describe('actualizar', () => {
  const datos = { nombre: 'Nuevo', descripcion: '', responsables: [2], integrantes: [3, 5] };

  test('si el grupo no existe o está dado de baja devuelve null sin modificar nada', async () => {
    const conn = mockConexion();
    conn.execute.mockResolvedValueOnce([[]]);

    await expect(grupoRepository.actualizar(10, datos)).resolves.toBeNull();

    expect(conn.execute.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(conn.execute).toHaveBeenCalledTimes(1);
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  test('reemplaza los datos y las personas, y devuelve solo los agregados', async () => {
    const conn = mockConexion();
    conn.execute
      .mockResolvedValueOnce([[{ id: 10 }]]) // SELECT ... FOR UPDATE
      .mockResolvedValueOnce([[{ usuario_id: 2 }, { usuario_id: 3 }, { usuario_id: 4 }]]) // actuales
      .mockResolvedValueOnce([{}]); // UPDATE grupos

    const resultado = await grupoRepository.actualizar(10, datos);

    expect(resultado).toEqual({ agregados: [5] });
    expect(conn.execute.mock.calls[2][1]).toEqual(['Nuevo', '', 10]);

    const [sqlDelete, paramsDelete] = conn.query.mock.calls[0];
    expect(sqlDelete).toContain('NOT IN');
    expect(paramsDelete).toEqual([10, [2, 3, 5]]);

    const [sqlInsert, paramsInsert] = conn.query.mock.calls[1];
    expect(sqlInsert).toContain('ON DUPLICATE KEY UPDATE');
    expect(paramsInsert).toEqual([
      [
        [10, 2, 1],
        [10, 3, 0],
        [10, 5, 0],
      ],
    ]);
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  test('si falla a mitad de camino hace rollback y propaga el error', async () => {
    const conn = mockConexion();
    const error = new Error('Conexión perdida');
    conn.execute
      .mockResolvedValueOnce([[{ id: 10 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{}]);
    conn.query.mockRejectedValue(error);

    await expect(grupoRepository.actualizar(10, datos)).rejects.toBe(error);

    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });
});

describe('darDeBaja', () => {
  test.each([
    [1, true],
    [0, false],
  ])('con %i filas afectadas devuelve %p', async (affectedRows, esperado) => {
    pool.execute.mockResolvedValue([{ affectedRows }]);

    await expect(grupoRepository.darDeBaja(10)).resolves.toBe(esperado);

    const [sql, params] = pool.execute.mock.calls[0];
    expect(sql).toContain('SET activo = 0');
    expect(sql).toContain('activo = 1');
    expect(params).toEqual([10]);
  });
});
