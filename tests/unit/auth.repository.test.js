// Verifica el SQL del reenvío de invitaciones sin una base real: se reemplaza el pool de mysql2.
jest.mock('../../src/config/db', () => ({
  query: jest.fn(),
  execute: jest.fn(),
  getConnection: jest.fn(),
}));

const pool = require('../../src/config/db');
const authRepository = require('../../src/server/v1/repositories/auth.repository');

function conexionFalsa() {
  const conexion = {
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
    execute: jest.fn(),
  };
  pool.getConnection.mockResolvedValue(conexion);
  return conexion;
}

describe('authRepository.renovarInvitacion', () => {
  const vencimiento = new Date('2026-12-01T00:00:00Z');

  test('si la cuenta fue invitada y sigue pendiente, invalida las anteriores y crea una nueva', async () => {
    const conexion = conexionFalsa();
    conexion.execute
      .mockResolvedValueOnce([[{ reciente: 0 }]]) // invitaciones anteriores
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // invalida las no usadas
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // INSERT

    const creado = await authRepository.renovarInvitacion(15, 'hash', vencimiento);

    const [sqlBusqueda, paramsBusqueda] = conexion.execute.mock.calls[0];
    expect(sqlBusqueda).toContain("t.tipo = 'invitacion'");
    expect(sqlBusqueda).toContain("e.codigo = 'pendiente_verificacion'");
    expect(paramsBusqueda).toEqual([15]);
    expect(conexion.execute.mock.calls[1][0]).toMatch(/SET usado = 1/);
    expect(conexion.execute.mock.calls[2][1]).toEqual([15, 'hash', vencimiento]);
    expect(conexion.commit).toHaveBeenCalled();
    expect(conexion.release).toHaveBeenCalled();
    expect(creado).toBe(true);
  });

  test('si nunca fue invitada (o ya no está pendiente) no crea nada', async () => {
    const conexion = conexionFalsa();
    conexion.execute.mockResolvedValueOnce([[]]);

    const creado = await authRepository.renovarInvitacion(15, 'hash', vencimiento);

    expect(creado).toBe(false);
    expect(conexion.execute).toHaveBeenCalledTimes(1);
    expect(conexion.rollback).toHaveBeenCalled();
    expect(conexion.release).toHaveBeenCalled();
  });

  test('si pidió otra hace menos de 60 segundos no crea nada', async () => {
    const conexion = conexionFalsa();
    conexion.execute.mockResolvedValueOnce([[{ reciente: 0 }, { reciente: 1 }]]);

    const creado = await authRepository.renovarInvitacion(15, 'hash', vencimiento);

    expect(creado).toBe(false);
    expect(conexion.execute).toHaveBeenCalledTimes(1);
    expect(conexion.rollback).toHaveBeenCalled();
  });
});
