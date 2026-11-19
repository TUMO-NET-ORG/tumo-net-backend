// Verifica el SQL que arma el listado de usuarios (CU01, flujo principal
// paso 2) sin una base real: se reemplaza el pool de mysql2.
jest.mock('../../src/config/db', () => ({
  query: jest.fn(),
  execute: jest.fn(),
  getConnection: jest.fn(),
}));

const fs = require('fs');
const path = require('path');
const pool = require('../../src/config/db');
const usuarioRepository = require('../../src/server/v1/repositories/usuario.repository');

function prepararRespuestas(total = 1, usuarios = [{ id: 1 }]) {
  pool.query
    .mockResolvedValueOnce([[{ total }]])
    .mockResolvedValueOnce([usuarios]);
}

function listar(filtros = {}) {
  return usuarioRepository.listar({ limite: 20, offset: 0, ...filtros });
}

const consultaConteo = () => pool.query.mock.calls[0];
const consultaListado = () => pool.query.mock.calls[1];

describe('usuarioRepository.listar', () => {
  test('sin filtro de estado excluye a los dados de baja', async () => {
    prepararRespuestas();

    await listar();

    const [sqlConteo, paramsConteo] = consultaConteo();
    const [sqlListado, paramsListado] = consultaListado();
    expect(sqlConteo).toContain("e.codigo <> 'dado_de_baja'");
    expect(sqlListado).toContain("e.codigo <> 'dado_de_baja'");
    expect(paramsConteo).toEqual([]);
    expect(paramsListado).toEqual([20, 0]);
  });

  test('con estado dado_de_baja los incluye filtrando por ese estado', async () => {
    prepararRespuestas();

    await listar({ estado: 'dado_de_baja' });

    const [sql, params] = consultaListado();
    expect(sql).toContain('e.codigo = ?');
    expect(sql).not.toContain("<> 'dado_de_baja'");
    expect(params).toEqual(['dado_de_baja', 20, 0]);
  });

  test('filtra por rol y estado a la vez', async () => {
    prepararRespuestas();

    await listar({ rol: 'tutor', estado: 'activo' });

    const [sql, params] = consultaConteo();
    expect(sql).toContain('e.codigo = ?');
    expect(sql).toContain('r.codigo = ?');
    expect(params).toEqual(['activo', 'tutor']);
  });

  test('busca por nombre, apellido, nombre completo o email con parámetros', async () => {
    prepararRespuestas();

    await listar({ busqueda: 'Ana Pérez' });

    const [sql, params] = consultaListado();
    expect(sql).toContain('u.nombre LIKE ?');
    expect(sql).toContain('u.apellido LIKE ?');
    expect(sql).toContain("CONCAT(u.nombre, ' ', u.apellido) LIKE ?");
    expect(sql).toContain('u.email LIKE ?');
    expect(sql).not.toContain('Ana Pérez');
    expect(params).toEqual(['%Ana Pérez%', '%Ana Pérez%', '%Ana Pérez%', '%Ana Pérez%', 20, 0]);
  });

  test('escapa los comodines de LIKE en la búsqueda', async () => {
    prepararRespuestas();

    await listar({ busqueda: '50%_a\\b' });

    const [, params] = consultaConteo();
    expect(params[0]).toBe('%50\\%\\_a\\\\b%');
  });

  test('aplica LIMIT y OFFSET con orden estable', async () => {
    prepararRespuestas();

    await listar({ limite: 10, offset: 30 });

    const [sql, params] = consultaListado();
    expect(sql).toMatch(/ORDER BY u\.apellido, u\.nombre, u\.id\s+LIMIT \? OFFSET \?/);
    expect(params).toEqual([10, 30]);
  });

  test('nunca selecciona el hash de la contraseña', async () => {
    prepararRespuestas();

    await listar();

    expect(consultaListado()[0]).not.toMatch(/password/i);
  });

  test('devuelve los usuarios y el total como número', async () => {
    prepararRespuestas('42', [{ id: 1 }, { id: 2 }]);

    const resultado = await listar();

    expect(resultado).toEqual({ usuarios: [{ id: 1 }, { id: 2 }], total: 42 });
  });
});

describe('usuarioRepository.actualizarEstado (baja lógica)', () => {
  test('actualiza id_estado con un UPDATE parametrizado y devuelve el usuario', async () => {
    pool.execute
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ id: 15, estado: 'dado_de_baja' }]]);

    const usuario = await usuarioRepository.actualizarEstado(15, 5);

    const [sql, params] = pool.execute.mock.calls[0];
    expect(sql).toMatch(/^UPDATE usuarios SET id_estado = \? WHERE id = \?$/);
    expect(params).toEqual([5, 15]);
    expect(usuario).toEqual({ id: 15, estado: 'dado_de_baja' });
  });

  test('el repositorio de usuarios nunca borra registros físicamente', () => {
    const fuente = fs.readFileSync(
      path.join(__dirname, '../../src/server/v1/repositories/usuario.repository.js'),
      'utf8',
    );

    expect(fuente).not.toMatch(/\bDELETE\b/i);
  });
});

describe('usuarioRepository.buscarIdEstadoPorCodigo', () => {
  test('devuelve el id del estado', async () => {
    pool.execute.mockResolvedValueOnce([[{ id: 5 }]]);

    await expect(usuarioRepository.buscarIdEstadoPorCodigo('dado_de_baja')).resolves.toBe(5);
    expect(pool.execute.mock.calls[0][1]).toEqual(['dado_de_baja']);
  });

  test('devuelve null si el estado no existe', async () => {
    pool.execute.mockResolvedValueOnce([[]]);

    await expect(usuarioRepository.buscarIdEstadoPorCodigo('dado_de_baja')).resolves.toBeNull();
  });
});

describe('usuarioRepository.restablecerPasswordTemporal (CU01 – flujo 3.a)', () => {
  function conexionFalsa() {
    const conexion = {
      beginTransaction: jest.fn().mockResolvedValue(),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      release: jest.fn(),
      execute: jest.fn(),
    };
    pool.getConnection.mockResolvedValue(conexion);
    return conexion;
  }

  test('reemplaza el hash, cierra sesiones, fuerza el cambio y desbloquea la cuenta', async () => {
    const conexion = conexionFalsa();
    conexion.execute
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 0 }])
      .mockResolvedValueOnce([[{ id: 15, estado: 'activo' }]]);

    const usuario = await usuarioRepository.restablecerPasswordTemporal(15, '$argon2id$hash');

    const [sql, params] = conexion.execute.mock.calls[0];
    expect(sql).toContain('password_hash = ?');
    expect(sql).toContain('password_version = password_version + 1');
    expect(sql).toContain('debe_cambiar_password = 1');
    expect(sql).toContain('intentos_fallidos = 0');
    expect(sql).toContain('bloqueado_hasta = NULL');
    expect(params).toEqual(['$argon2id$hash', 15]);
    expect(conexion.commit).toHaveBeenCalled();
    expect(conexion.release).toHaveBeenCalled();
    expect(usuario).toEqual({ id: 15, estado: 'activo' });
  });

  test('invalida los enlaces de recuperación pendientes', async () => {
    const conexion = conexionFalsa();
    conexion.execute
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 2 }])
      .mockResolvedValueOnce([[{ id: 15 }]]);

    await usuarioRepository.restablecerPasswordTemporal(15, 'hash');

    const [sql, params] = conexion.execute.mock.calls[1];
    expect(sql).toMatch(/UPDATE token_recuperacion\s+SET usado = 1/);
    expect(params).toEqual([15]);
  });

  test('si algo falla hace rollback y libera la conexión', async () => {
    const conexion = conexionFalsa();
    conexion.execute.mockRejectedValueOnce(new Error('falla de base'));

    await expect(usuarioRepository.restablecerPasswordTemporal(15, 'hash')).rejects.toThrow(
      'falla de base',
    );
    expect(conexion.rollback).toHaveBeenCalled();
    expect(conexion.commit).not.toHaveBeenCalled();
    expect(conexion.release).toHaveBeenCalled();
  });
});
