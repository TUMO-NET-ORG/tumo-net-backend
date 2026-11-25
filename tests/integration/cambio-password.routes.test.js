// CU01: una cuenta creada por el administrador debe cambiar su contraseña
// inicial antes de usar el resto de la API.
jest.mock('../../src/server/v1/repositories/auth.repository');
jest.mock('../../src/server/v1/repositories/usuario.repository');
jest.mock('../../src/server/v1/services/mail.service');

const request = require('supertest');
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const authRepository = require('../../src/server/v1/repositories/auth.repository');
const usuarioRepository = require('../../src/server/v1/repositories/usuario.repository');

const PASSWORD_INICIAL = 'Inicial12345';
let passwordHash;

beforeAll(async () => {
  passwordHash = await argon2.hash(PASSWORD_INICIAL);
});

function sesion({ rol = 'administrador', debeCambiarPassword = 1 } = {}) {
  const usuario = {
    id: 1,
    nombre: 'Admin',
    apellido: 'TUMO',
    email: 'admin@tumo.world',
    passwordHash,
    passwordVersion: 0,
    debeCambiarPassword,
    rol,
    estado: 'activo',
  };
  authRepository.buscarActivoPorId.mockResolvedValue(usuario);
  authRepository.buscarPorEmail.mockResolvedValue(usuario);

  return jwt.sign({ sub: '1', rol, passwordVersion: 0 }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });
}

describe('cuenta con cambio de contraseña pendiente', () => {
  test('no puede usar rutas protegidas: 403 CAMBIO_PASSWORD_REQUERIDO', async () => {
    const res = await request(app)
      .post('/api/v1/usuarios')
      .set('Authorization', `Bearer ${sesion()}`)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('CAMBIO_PASSWORD_REQUERIDO');
    expect(usuarioRepository.crear).not.toHaveBeenCalled();
  });

  test('sí puede consultar su sesión y ve que debe cambiar la contraseña', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${sesion()}`);

    expect(res.status).toBe(200);
    expect(res.body.usuario.debeCambiarPassword).toBe(true);
  });

  test('sí puede cerrar sesión', async () => {
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${sesion()}`);

    expect(res.status).toBe(204);
  });

  test('una cuenta sin cambio pendiente usa las rutas con normalidad', async () => {
    usuarioRepository.buscarIdsPorCodigo.mockResolvedValue({ id_rol: 3, id_estado: 4 });
    usuarioRepository.crearPendientePorAdmin.mockResolvedValue({
      id: 2,
      rol: 'staff',
      estado: 'pendiente_verificacion',
      email: 'lucia@tumo.world',
    });

    const res = await request(app)
      .post('/api/v1/usuarios')
      .set('Authorization', `Bearer ${sesion({ debeCambiarPassword: 0 })}`)
      .send({
        nombre: 'Lucía',
        apellido: 'Gómez',
        documento: '45678905',
        email: 'lucia@tumo.world',
        rol: 'staff',
      });

    expect(res.status).toBe(202);
  });
});

describe('POST /api/v1/auth/change-password', () => {
  beforeEach(() => {
    authRepository.actualizarPassword.mockResolvedValue(true);
  });

  test('sin token responde 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .send({ passwordActual: PASSWORD_INICIAL, nuevaPassword: 'MiClaveNueva99' });

    expect(res.status).toBe(401);
  });

  test('con cambio pendiente permite cambiarla y devuelve un token nuevo', async () => {
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${sesion()}`)
      .send({ passwordActual: PASSWORD_INICIAL, nuevaPassword: 'MiClaveNueva99' });

    expect(res.status).toBe(200);
    expect(authRepository.actualizarPassword).toHaveBeenCalledWith(1, expect.stringMatching(/^\$argon2/));
    expect(jwt.verify(res.body.token, process.env.JWT_SECRET)).toMatchObject({
      sub: '1',
      passwordVersion: 1,
    });
  });

  test('con contraseña actual incorrecta responde 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${sesion()}`)
      .send({ passwordActual: 'Incorrecta123', nuevaPassword: 'MiClaveNueva99' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('PASSWORD_ACTUAL_INCORRECTA');
  });

  test('con una nueva contraseña que incumple la política responde 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${sesion()}`)
      .send({ passwordActual: PASSWORD_INICIAL, nuevaPassword: 'corta' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('DATOS_INVALIDOS');
    expect(authRepository.actualizarPassword).not.toHaveBeenCalled();
  });
});
