jest.mock('../../src/server/v1/repositories/auth.repository');
jest.mock('../../src/server/v1/services/mail.service');

const argon2 = require('argon2');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const authRepository = require('../../src/server/v1/repositories/auth.repository');
const mailService = require('../../src/server/v1/services/mail.service');
const authService = require('../../src/server/v1/services/auth.service');

const PASSWORD = 'Contrasena123';
let passwordHash;

beforeAll(async () => {
  passwordHash = await argon2.hash(PASSWORD);
});

function usuarioBase(cambios = {}) {
  return {
    id: 7,
    nombre: 'Ana',
    apellido: 'Pérez',
    documento: '12345678',
    email: 'ana@tumo.world',
    passwordHash,
    passwordVersion: 0,
    intentosFallidos: 0,
    bloqueadoHasta: null,
    rol: 'alumno',
    estado: 'activo',
    ...cambios,
  };
}

const sha256 = (texto) => crypto.createHash('sha256').update(texto).digest('hex');
const enMinutos = (minutos) => new Date(Date.now() + minutos * 60 * 1000);

describe('iniciarSesion (CU05 flujo principal y 4.a)', () => {
  test('con credenciales correctas devuelve un JWT con rol y reinicia intentos', async () => {
    authRepository.buscarPorEmail.mockResolvedValue(usuarioBase({ intentosFallidos: 2 }));

    const resultado = await authService.iniciarSesion('ana@tumo.world', PASSWORD);

    const payload = jwt.verify(resultado.token, process.env.JWT_SECRET);
    expect(payload).toMatchObject({ sub: '7', rol: 'alumno', passwordVersion: 0 });
    expect(resultado.usuario).not.toHaveProperty('passwordHash');
    expect(authRepository.reiniciarIntentos).toHaveBeenCalledWith(7);
  });

  test('con email inexistente responde 401 genérico', async () => {
    authRepository.buscarPorEmail.mockResolvedValue(undefined);

    await expect(
      authService.iniciarSesion('nadie@tumo.world', PASSWORD),
    ).rejects.toMatchObject({ statusCode: 401, code: 'CREDENCIALES_INVALIDAS' });
  });

  test('con contraseña incorrecta suma un intento y responde 401', async () => {
    authRepository.buscarPorEmail.mockResolvedValue(usuarioBase({ intentosFallidos: 1 }));

    await expect(
      authService.iniciarSesion('ana@tumo.world', 'otraClave999'),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(authRepository.registrarIntentoFallido).toHaveBeenCalledWith(7, false);
  });

  test('al 5º intento fallido bloquea la cuenta (423)', async () => {
    authRepository.buscarPorEmail.mockResolvedValue(usuarioBase({ intentosFallidos: 4 }));

    await expect(
      authService.iniciarSesion('ana@tumo.world', 'otraClave999'),
    ).rejects.toMatchObject({ statusCode: 423, code: 'USUARIO_BLOQUEADO' });
    expect(authRepository.registrarIntentoFallido).toHaveBeenCalledWith(7, true);
  });

  test('cuenta bloqueada + contraseña correcta informa el bloqueo', async () => {
    authRepository.buscarPorEmail.mockResolvedValue(
      usuarioBase({ intentosFallidos: 5, bloqueadoHasta: enMinutos(10) }),
    );

    await expect(
      authService.iniciarSesion('ana@tumo.world', PASSWORD),
    ).rejects.toMatchObject({ statusCode: 423 });
  });

  test('cuenta bloqueada + contraseña incorrecta no revela el bloqueo ni suma intentos', async () => {
    authRepository.buscarPorEmail.mockResolvedValue(
      usuarioBase({ intentosFallidos: 5, bloqueadoHasta: enMinutos(10) }),
    );

    await expect(
      authService.iniciarSesion('ana@tumo.world', 'otraClave999'),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(authRepository.registrarIntentoFallido).not.toHaveBeenCalled();
  });

  test('con el bloqueo vencido vuelve a permitir el ingreso', async () => {
    authRepository.buscarPorEmail.mockResolvedValue(
      usuarioBase({ intentosFallidos: 5, bloqueadoHasta: enMinutos(-1) }),
    );

    await expect(
      authService.iniciarSesion('ana@tumo.world', PASSWORD),
    ).resolves.toHaveProperty('token');
  });

  test('email sin verificar: 403 EMAIL_NO_VERIFICADO solo con la contraseña correcta', async () => {
    authRepository.buscarPorEmail.mockResolvedValue(
      usuarioBase({ estado: 'pendiente_verificacion' }),
    );

    await expect(
      authService.iniciarSesion('ana@tumo.world', PASSWORD),
    ).rejects.toMatchObject({ statusCode: 403, code: 'EMAIL_NO_VERIFICADO' });
    await expect(
      authService.iniciarSesion('ana@tumo.world', 'otraClave999'),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  test('cuenta suspendida: 403 USUARIO_NO_ACTIVO', async () => {
    authRepository.buscarPorEmail.mockResolvedValue(usuarioBase({ estado: 'suspendido' }));

    await expect(
      authService.iniciarSesion('ana@tumo.world', PASSWORD),
    ).rejects.toMatchObject({ statusCode: 403, code: 'USUARIO_NO_ACTIVO' });
  });
});

describe('validarUsuarioToken (sesión y RF7)', () => {
  test('rechaza un token emitido antes de un cambio de contraseña', async () => {
    authRepository.buscarActivoPorId.mockResolvedValue(usuarioBase({ passwordVersion: 1 }));

    await expect(authService.validarUsuarioToken(7, 0)).rejects.toMatchObject({
      statusCode: 401,
      code: 'TOKEN_INVALIDO',
    });
  });

  test('rechaza a un usuario que ya no está activo', async () => {
    authRepository.buscarActivoPorId.mockResolvedValue(usuarioBase({ estado: 'inactivo' }));

    await expect(authService.validarUsuarioToken(7, 0)).rejects.toMatchObject({
      statusCode: 401,
    });
  });
});

describe('solicitarRecuperacion (CU05 3.a)', () => {
  test('genera un token, guarda solo su hash y envía el enlace', async () => {
    authRepository.buscarPorEmail.mockResolvedValue(usuarioBase());
    authRepository.crearTokenRecuperacion.mockResolvedValue(true);

    await authService.solicitarRecuperacion('ana@tumo.world');

    const [usuarioId, tokenHash, vencimiento] =
      authRepository.crearTokenRecuperacion.mock.calls[0];
    const [, tokenEnviado] = mailService.enviarEnlaceRecuperacion.mock.calls[0];
    expect(usuarioId).toBe(7);
    expect(tokenHash).toBe(sha256(tokenEnviado));
    expect(tokenHash).not.toBe(tokenEnviado);
    expect(vencimiento.getTime()).toBeGreaterThan(Date.now());
  });

  test('si el email no existe no hace nada (y no da error)', async () => {
    authRepository.buscarPorEmail.mockResolvedValue(undefined);

    await expect(authService.solicitarRecuperacion('x@tumo.world')).resolves.toBeUndefined();
    expect(mailService.enviarEnlaceRecuperacion).not.toHaveBeenCalled();
  });

  test('si falla el envío del mail no lo propaga (no revela que el email existe)', async () => {
    authRepository.buscarPorEmail.mockResolvedValue(usuarioBase());
    authRepository.crearTokenRecuperacion.mockResolvedValue(true);
    mailService.enviarEnlaceRecuperacion.mockRejectedValue(new Error('SMTP caído'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(authService.solicitarRecuperacion('ana@tumo.world')).resolves.toBeUndefined();
  });

  test('si hubo un pedido hace menos de 60 s no envía otro mail', async () => {
    authRepository.buscarPorEmail.mockResolvedValue(usuarioBase());
    authRepository.crearTokenRecuperacion.mockResolvedValue(false);

    await authService.solicitarRecuperacion('ana@tumo.world');
    expect(mailService.enviarEnlaceRecuperacion).not.toHaveBeenCalled();
  });
});

describe('restablecerPassword (CU05 3.a.3)', () => {
  test('guarda la nueva contraseña hasheada con argon2', async () => {
    authRepository.restablecerPassword.mockResolvedValue(true);
    const token = 'b'.repeat(64);

    await authService.restablecerPassword(token, 'NuevaClave123');

    const [tokenHash, nuevoHash] = authRepository.restablecerPassword.mock.calls[0];
    expect(tokenHash).toBe(sha256(token));
    expect(nuevoHash.startsWith('$argon2')).toBe(true);
    await expect(argon2.verify(nuevoHash, 'NuevaClave123')).resolves.toBe(true);
  });

  test('con token vencido o ya usado responde 400 TOKEN_INVALIDO', async () => {
    authRepository.restablecerPassword.mockResolvedValue(false);

    await expect(
      authService.restablecerPassword('c'.repeat(64), 'NuevaClave123'),
    ).rejects.toMatchObject({ statusCode: 400, code: 'TOKEN_INVALIDO' });
  });
});

describe('verificarEmail (registro, CU05 2.a)', () => {
  const codigo = '123456';
  function verificacion(cambios = {}) {
    return {
      usuarioId: 7,
      verificacionId: 3,
      estado: 'pendiente_verificacion',
      codigoHash: sha256(codigo),
      fechaExpiracion: enMinutos(5),
      intentosFallidos: 0,
      usado: 0,
      ...cambios,
    };
  }

  test('con el código correcto activa la cuenta', async () => {
    authRepository.buscarVerificacionPorEmail.mockResolvedValue(verificacion());
    authRepository.confirmarEmail.mockResolvedValue(true);

    await authService.verificarEmail('ana@tumo.world', codigo);
    expect(authRepository.confirmarEmail).toHaveBeenCalledWith(7, 3);
  });

  test('con un código incorrecto registra el intento', async () => {
    authRepository.buscarVerificacionPorEmail.mockResolvedValue(verificacion());

    await expect(
      authService.verificarEmail('ana@tumo.world', '000000'),
    ).rejects.toMatchObject({ code: 'CODIGO_INVALIDO' });
    expect(authRepository.registrarIntentoVerificacion).toHaveBeenCalledWith(3);
  });

  test('con el código vencido responde CODIGO_VENCIDO', async () => {
    authRepository.buscarVerificacionPorEmail.mockResolvedValue(
      verificacion({ fechaExpiracion: enMinutos(-1) }),
    );

    await expect(
      authService.verificarEmail('ana@tumo.world', codigo),
    ).rejects.toMatchObject({ code: 'CODIGO_VENCIDO' });
  });

  test('tras 5 intentos fallidos bloquea la verificación', async () => {
    authRepository.buscarVerificacionPorEmail.mockResolvedValue(
      verificacion({ intentosFallidos: 5 }),
    );

    await expect(
      authService.verificarEmail('ana@tumo.world', codigo),
    ).rejects.toMatchObject({ statusCode: 423 });
  });
});
