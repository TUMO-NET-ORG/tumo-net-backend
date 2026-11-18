jest.mock('../../src/server/v1/repositories/auth.repository');
jest.mock('../../src/server/v1/services/mail.service');

const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const authRepository = require('../../src/server/v1/repositories/auth.repository');
const authService = require('../../src/server/v1/services/auth.service');

const PASSWORD_INICIAL = 'Inicial12345';
const PASSWORD_NUEVA = 'MiClaveNueva99';
let passwordHash;

beforeAll(async () => {
  passwordHash = await argon2.hash(PASSWORD_INICIAL);
});

function usuarioBD(cambios = {}) {
  return {
    id: 15,
    nombre: 'Lucía',
    apellido: 'Gómez',
    documento: '45678905',
    email: 'lucia@tumo.world',
    passwordHash,
    passwordVersion: 3,
    debeCambiarPassword: 1,
    intentosFallidos: 0,
    bloqueadoHasta: null,
    rol: 'staff',
    estado: 'activo',
    ...cambios,
  };
}

const sesion = { id: 15, email: 'lucia@tumo.world' };

describe('cambiarPassword (CU01 – cambio de la contraseña inicial)', () => {
  beforeEach(() => {
    authRepository.buscarPorEmail.mockResolvedValue(usuarioBD());
    authRepository.actualizarPassword.mockResolvedValue(true);
  });

  test('guarda la nueva contraseña con hash argon2 y nunca en texto plano', async () => {
    await authService.cambiarPassword(sesion, PASSWORD_INICIAL, PASSWORD_NUEVA);

    const [id, nuevoHash] = authRepository.actualizarPassword.mock.calls[0];
    expect(id).toBe(15);
    expect(nuevoHash).toMatch(/^\$argon2/);
    expect(nuevoHash).not.toContain(PASSWORD_NUEVA);
    await expect(argon2.verify(nuevoHash, PASSWORD_NUEVA)).resolves.toBe(true);
  });

  test('devuelve un token con la passwordVersion nueva', async () => {
    const { token } = await authService.cambiarPassword(
      sesion,
      PASSWORD_INICIAL,
      PASSWORD_NUEVA,
    );

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    expect(payload).toMatchObject({ sub: '15', rol: 'staff', passwordVersion: 4 });
  });

  test('con la contraseña actual incorrecta responde 401 y no cambia nada', async () => {
    await expect(
      authService.cambiarPassword(sesion, 'OtraClave12345', PASSWORD_NUEVA),
    ).rejects.toMatchObject({ statusCode: 401, code: 'PASSWORD_ACTUAL_INCORRECTA' });
    expect(authRepository.actualizarPassword).not.toHaveBeenCalled();
  });

  test('si la nueva es igual a la actual responde 400', async () => {
    await expect(
      authService.cambiarPassword(sesion, PASSWORD_INICIAL, PASSWORD_INICIAL),
    ).rejects.toMatchObject({ statusCode: 400, code: 'PASSWORD_REPETIDA' });
    expect(authRepository.actualizarPassword).not.toHaveBeenCalled();
  });

  test('si el usuario ya no existe responde 401', async () => {
    authRepository.buscarPorEmail.mockResolvedValue(undefined);

    await expect(
      authService.cambiarPassword(sesion, PASSWORD_INICIAL, PASSWORD_NUEVA),
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe('iniciarSesion informa si debe cambiar la contraseña', () => {
  test('cuenta creada por el administrador: debeCambiarPassword = true', async () => {
    authRepository.buscarPorEmail.mockResolvedValue(usuarioBD());

    const { usuario } = await authService.iniciarSesion('lucia@tumo.world', PASSWORD_INICIAL);

    expect(usuario.debeCambiarPassword).toBe(true);
  });

  test('cuenta normal: debeCambiarPassword = false', async () => {
    authRepository.buscarPorEmail.mockResolvedValue(usuarioBD({ debeCambiarPassword: 0 }));

    const { usuario } = await authService.iniciarSesion('lucia@tumo.world', PASSWORD_INICIAL);

    expect(usuario.debeCambiarPassword).toBe(false);
  });
});
