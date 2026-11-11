// Pruebas de integración de la API de CU05: recorren rutas, validadores,
// controladores, servicios y middlewares reales. Solo se reemplazan la base
// de datos (repositorios) y el envío de correos.
jest.mock('../../src/server/v1/repositories/auth.repository');
jest.mock('../../src/server/v1/repositories/usuario.repository');
jest.mock('../../src/server/v1/services/mail.service');

const request = require('supertest');
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const authRepository = require('../../src/server/v1/repositories/auth.repository');
const usuarioRepository = require('../../src/server/v1/repositories/usuario.repository');
const mailService = require('../../src/server/v1/services/mail.service');

const PASSWORD = 'Contrasena123';
let passwordHash;

beforeAll(async () => {
  passwordHash = await argon2.hash(PASSWORD);
});

function usuarioBD(cambios = {}) {
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

function tokenPara(usuario = usuarioBD()) {
  return jwt.sign(
    {
      sub: String(usuario.id),
      rol: usuario.rol,
      passwordVersion: usuario.passwordVersion,
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );
}

describe('GET /api/health', () => {
  test('la API levanta y responde', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ estado: 'ok' });
  });
});

describe('POST /api/v1/auth/login', () => {
  test('200 con token y datos del usuario sin el hash', async () => {
    authRepository.buscarPorEmail.mockResolvedValue(usuarioBD());

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ana@tumo.world', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.usuario).toMatchObject({ email: 'ana@tumo.world', rol: 'alumno' });
    expect(res.body.usuario).not.toHaveProperty('passwordHash');
  });

  test('401 con contraseña incorrecta', async () => {
    authRepository.buscarPorEmail.mockResolvedValue(usuarioBD());

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ana@tumo.world', password: 'incorrecta' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('CREDENCIALES_INVALIDAS');
  });

  test('423 al quinto intento fallido', async () => {
    authRepository.buscarPorEmail.mockResolvedValue(usuarioBD({ intentosFallidos: 4 }));

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ana@tumo.world', password: 'incorrecta' });

    expect(res.status).toBe(423);
    expect(res.body.error).toBe('USUARIO_BLOQUEADO');
  });

  test('400 con un dominio de email no permitido', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ana@hotmail.com', password: PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('DATOS_INVALIDOS');
    expect(res.body.detalles[0]).toMatchObject({ campo: 'email' });
    expect(authRepository.buscarPorEmail).not.toHaveBeenCalled();
  });
});

describe('rutas protegidas (RF7)', () => {
  test('GET /me sin token responde 401', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('TOKEN_NO_PROVISTO');
  });

  test('GET /me con token inválido responde 401', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer no-es-un-jwt');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('TOKEN_INVALIDO');
  });

  test('GET /me con token firmado con otra clave responde 401', async () => {
    const falso = jwt.sign({ sub: '7', passwordVersion: 0 }, 'otra-clave');
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${falso}`);
    expect(res.status).toBe(401);
  });

  test('GET /me con token válido devuelve el perfil', async () => {
    authRepository.buscarActivoPorId.mockResolvedValue(usuarioBD());

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${tokenPara()}`);

    expect(res.status).toBe(200);
    expect(res.body.usuario).toEqual({
      id: 7,
      nombre: 'Ana',
      apellido: 'Pérez',
      email: 'ana@tumo.world',
      rol: 'alumno',
      estado: 'activo',
    });
  });

  test('GET /me con un token anterior a un cambio de contraseña responde 401', async () => {
    authRepository.buscarActivoPorId.mockResolvedValue(usuarioBD({ passwordVersion: 1 }));

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${tokenPara(usuarioBD({ passwordVersion: 0 }))}`);

    expect(res.status).toBe(401);
  });

  test('POST /logout con sesión responde 204', async () => {
    authRepository.buscarActivoPorId.mockResolvedValue(usuarioBD());

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${tokenPara()}`);

    expect(res.status).toBe(204);
  });

  test('POST /logout sin sesión responde 401', async () => {
    const res = await request(app).post('/api/v1/auth/logout');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/auth/forgot-password', () => {
  test('202 con mensaje genérico si el email existe', async () => {
    authRepository.buscarPorEmail.mockResolvedValue(usuarioBD());
    authRepository.crearTokenRecuperacion.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'ana@tumo.world' });

    expect(res.status).toBe(202);
    expect(mailService.enviarEnlaceRecuperacion).toHaveBeenCalled();
  });

  test('misma respuesta 202 si el email no existe', async () => {
    authRepository.buscarPorEmail.mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nadie@tumo.world' });

    expect(res.status).toBe(202);
    expect(mailService.enviarEnlaceRecuperacion).not.toHaveBeenCalled();
  });

  test('misma respuesta 202 aunque falle el envío del mail', async () => {
    authRepository.buscarPorEmail.mockResolvedValue(usuarioBD());
    authRepository.crearTokenRecuperacion.mockResolvedValue(true);
    mailService.enviarEnlaceRecuperacion.mockRejectedValue(new Error('SMTP caído'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'ana@tumo.world' });

    expect(res.status).toBe(202);
  });
});

describe('POST /api/v1/auth/reset-password', () => {
  test('200 con token válido y contraseña que cumple la política', async () => {
    authRepository.restablecerPassword.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'a'.repeat(64), nuevaPassword: 'NuevaClave123' });

    expect(res.status).toBe(200);
  });

  test('400 si la contraseña tiene menos de 10 caracteres', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'a'.repeat(64), nuevaPassword: 'Corta12' });

    expect(res.status).toBe(400);
    expect(res.body.detalles[0].mensaje).toMatch(/10 caracteres/);
    expect(authRepository.restablecerPassword).not.toHaveBeenCalled();
  });

  test('400 TOKEN_INVALIDO si el token venció o ya se usó', async () => {
    authRepository.restablecerPassword.mockResolvedValue(false);

    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'a'.repeat(64), nuevaPassword: 'NuevaClave123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('TOKEN_INVALIDO');
  });
});

describe('registro: POST /api/v1/usuarios/alta (CU05 2.a / 2.b)', () => {
  const datos = {
    nombre: 'Ana',
    apellido: 'Pérez',
    documento: '12345678',
    email: 'ana@tumo.world',
    password: 'Contrasena123',
    aceptaTerminos: true,
    versionTerminos: '1.0',
  };

  test('202: crea el usuario pendiente de verificación y envía el código', async () => {
    usuarioRepository.buscarIdsPorCodigo.mockResolvedValue({ id_rol: 2, id_estado: 4 });
    usuarioRepository.crearConVerificacion.mockResolvedValue({
      id: 7,
      email: 'ana@tumo.world',
      rol: 'alumno',
      estado: 'pendiente_verificacion',
    });

    const res = await request(app).post('/api/v1/usuarios/alta').send(datos);

    expect(res.status).toBe(202);
    expect(res.body.usuario.estado).toBe('pendiente_verificacion');
    const [usuarioGuardado] = usuarioRepository.crearConVerificacion.mock.calls[0];
    expect(usuarioGuardado.passwordHash.startsWith('$argon2')).toBe(true);
    expect(mailService.enviarCodigoVerificacion).toHaveBeenCalledWith(
      'ana@tumo.world',
      expect.stringMatching(/^\d{6}$/),
    );
    // El código nunca vuelve en la respuesta
    expect(JSON.stringify(res.body)).not.toMatch(/codigoVerificacion/);
  });

  test('400 si el dominio no está permitido (2.b)', async () => {
    const res = await request(app)
      .post('/api/v1/usuarios/alta')
      .send({ ...datos, email: 'ana@hotmail.com' });

    expect(res.status).toBe(400);
    expect(res.body.detalles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          campo: 'email',
          mensaje: 'El email debe pertenecer a uno de los dominios permitidos',
        }),
      ]),
    );
    expect(usuarioRepository.crearConVerificacion).not.toHaveBeenCalled();
  });

  test('409 si el email o documento ya está registrado', async () => {
    usuarioRepository.buscarIdsPorCodigo.mockResolvedValue({ id_rol: 2, id_estado: 4 });
    usuarioRepository.crearConVerificacion.mockRejectedValue(
      Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' }),
    );

    const res = await request(app).post('/api/v1/usuarios/alta').send(datos);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('USUARIO_DUPLICADO');
  });
});

describe('POST /api/v1/auth/resend-verification', () => {
  test('202 y envía un código nuevo a un usuario pendiente', async () => {
    authRepository.buscarPorEmail.mockResolvedValue(
      usuarioBD({ estado: 'pendiente_verificacion' }),
    );
    authRepository.crearNuevaVerificacion.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/v1/auth/resend-verification')
      .send({ email: 'ana@tumo.world' });

    expect(res.status).toBe(202);
    expect(mailService.enviarCodigoVerificacion).toHaveBeenCalledWith(
      'ana@tumo.world',
      expect.stringMatching(/^\d{6}$/),
    );
  });

  test('202 sin enviar nada si la cuenta ya está activa', async () => {
    authRepository.buscarPorEmail.mockResolvedValue(usuarioBD());

    const res = await request(app)
      .post('/api/v1/auth/resend-verification')
      .send({ email: 'ana@tumo.world' });

    expect(res.status).toBe(202);
    expect(authRepository.crearNuevaVerificacion).not.toHaveBeenCalled();
    expect(mailService.enviarCodigoVerificacion).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/auth/verify-email', () => {
  test('400 si el código no tiene 6 dígitos', async () => {
    const res = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ email: 'ana@tumo.world', codigo: '12ab' });

    expect(res.status).toBe(400);
    expect(res.body.detalles[0].mensaje).toBe('El código debe tener 6 dígitos');
  });
});

describe('rutas inexistentes', () => {
  test('404 con formato de error uniforme', async () => {
    const res = await request(app).get('/api/v1/no-existe');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('RUTA_NO_ENCONTRADA');
  });
});
