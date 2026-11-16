// Pruebas de integración de CU01 – alta individual por el administrador.
// Recorren ruta, middlewares, validador, controlador y servicio reales;
// solo se reemplazan los repositorios (base de datos) y el correo.
jest.mock('../../src/server/v1/repositories/auth.repository');
jest.mock('../../src/server/v1/repositories/usuario.repository');
jest.mock('../../src/server/v1/services/mail.service');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const authRepository = require('../../src/server/v1/repositories/auth.repository');
const usuarioRepository = require('../../src/server/v1/repositories/usuario.repository');

const URL = '/api/v1/usuarios';

function sesion(rol) {
  authRepository.buscarActivoPorId.mockResolvedValue({
    id: 1,
    nombre: 'Admin',
    apellido: 'TUMO',
    email: 'admin@tumo.world',
    passwordVersion: 0,
    rol,
    estado: 'activo',
  });

  return jwt.sign({ sub: '1', rol, passwordVersion: 0 }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });
}

function cuerpo(cambios = {}) {
  return {
    nombre: 'Lucía',
    apellido: 'Gómez',
    documento: '45678901',
    email: 'lucia@tumo.world',
    password: 'Inicial12345',
    rol: 'staff',
    ...cambios,
  };
}

describe('POST /api/v1/usuarios (CU01 – alta por administrador)', () => {
  beforeEach(() => {
    usuarioRepository.buscarIdsPorCodigo.mockResolvedValue({ id_rol: 3, id_estado: 1 });
    usuarioRepository.crear.mockResolvedValue({
      id: 15,
      nombre: 'Lucía',
      apellido: 'Gómez',
      documento: '45678901',
      email: 'lucia@tumo.world',
      rol: 'staff',
      estado: 'activo',
    });
  });

  test('sin token responde 401', async () => {
    const res = await request(app).post(URL).send(cuerpo());

    expect(res.status).toBe(401);
    expect(usuarioRepository.crear).not.toHaveBeenCalled();
  });

  test.each(['alumno', 'staff', 'tutor'])('con rol %s responde 403 (RNF12)', async (rol) => {
    const res = await request(app)
      .post(URL)
      .set('Authorization', `Bearer ${sesion(rol)}`)
      .send(cuerpo());

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('SIN_PERMISO');
    expect(usuarioRepository.crear).not.toHaveBeenCalled();
  });

  test('como administrador crea el usuario activo y responde 201', async () => {
    const res = await request(app)
      .post(URL)
      .set('Authorization', `Bearer ${sesion('administrador')}`)
      .send(cuerpo());

    expect(res.status).toBe(201);
    expect(res.body.usuario).toMatchObject({ id: 15, rol: 'staff', estado: 'activo' });
    expect(res.body.usuario).not.toHaveProperty('passwordHash');
    expect(usuarioRepository.buscarIdsPorCodigo).toHaveBeenCalledWith('staff', 'activo');
  });

  test('con datos faltantes o inválidos responde 400 con el detalle (4.a)', async () => {
    const res = await request(app)
      .post(URL)
      .set('Authorization', `Bearer ${sesion('administrador')}`)
      .send({ email: 'no-es-email', password: 'corta', rol: 'superusuario' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('DATOS_INVALIDOS');
    const campos = res.body.detalles.map((d) => d.campo);
    expect(campos).toEqual(
      expect.arrayContaining(['nombre', 'apellido', 'documento', 'email', 'password', 'rol']),
    );
    expect(usuarioRepository.crear).not.toHaveBeenCalled();
  });

  test('con email ya registrado responde 409', async () => {
    const duplicado = new Error("Duplicate entry for key 'usuarios.uk_usuario_email'");
    duplicado.code = 'ER_DUP_ENTRY';
    duplicado.sqlMessage = duplicado.message;
    usuarioRepository.crear.mockRejectedValue(duplicado);

    const res = await request(app)
      .post(URL)
      .set('Authorization', `Bearer ${sesion('administrador')}`)
      .send(cuerpo());

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EMAIL_DUPLICADO');
  });
});
