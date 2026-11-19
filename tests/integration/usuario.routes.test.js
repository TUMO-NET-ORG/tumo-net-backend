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
    documento: '45678905',
    email: 'lucia@tumo.world',
    rol: 'staff',
    ...cambios,
  };
}

describe('POST /api/v1/usuarios (CU01 – alta por administrador)', () => {
  beforeEach(() => {
    usuarioRepository.buscarIdsPorCodigo.mockResolvedValue({ id_rol: 3, id_estado: 4 });
    usuarioRepository.crearPendientePorAdmin.mockResolvedValue({
      id: 15,
      nombre: 'Lucía',
      apellido: 'Gómez',
      documento: '45678905',
      email: 'lucia@tumo.world',
      rol: 'staff',
      estado: 'pendiente_verificacion',
    });
  });

  test('sin token responde 401', async () => {
    const res = await request(app).post(URL).send(cuerpo());

    expect(res.status).toBe(401);
    expect(usuarioRepository.crearPendientePorAdmin).not.toHaveBeenCalled();
  });

  test.each(['alumno', 'staff', 'tutor'])('con rol %s responde 403 (RNF12)', async (rol) => {
    const res = await request(app)
      .post(URL)
      .set('Authorization', `Bearer ${sesion(rol)}`)
      .send(cuerpo());

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('SIN_PERMISO');
    expect(usuarioRepository.crearPendientePorAdmin).not.toHaveBeenCalled();
  });

  test('como administrador crea el usuario pendiente y responde 202', async () => {
    const res = await request(app)
      .post(URL)
      .set('Authorization', `Bearer ${sesion('administrador')}`)
      .send(cuerpo());

    expect(res.status).toBe(202);
    expect(res.body.usuario).toMatchObject({ id: 15, rol: 'staff', estado: 'pendiente_verificacion' });
    expect(res.body.usuario).not.toHaveProperty('passwordHash');
    expect(usuarioRepository.buscarIdsPorCodigo).toHaveBeenCalledWith('staff', 'pendiente_verificacion');
  });

  test('con datos faltantes o inválidos responde 400 con el detalle (4.a)', async () => {
    const res = await request(app)
      .post(URL)
      .set('Authorization', `Bearer ${sesion('administrador')}`)
      .send({ email: 'no-es-email', rol: 'superusuario' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('DATOS_INVALIDOS');
    const campos = res.body.detalles.map((d) => d.campo);
    expect(campos).toEqual(
      expect.arrayContaining(['nombre', 'apellido', 'documento', 'email', 'rol']),
    );
    expect(usuarioRepository.crearPendientePorAdmin).not.toHaveBeenCalled();
  });

  test('con email ya registrado responde 409', async () => {
    const duplicado = new Error("Duplicate entry for key 'usuarios.uk_usuario_email'");
    duplicado.code = 'ER_DUP_ENTRY';
    duplicado.sqlMessage = duplicado.message;
    usuarioRepository.crearPendientePorAdmin.mockRejectedValue(duplicado);

    const res = await request(app)
      .post(URL)
      .set('Authorization', `Bearer ${sesion('administrador')}`)
      .send(cuerpo());

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EMAIL_DUPLICADO');
  });
});

describe('PATCH /api/v1/usuarios/:id (CU01 – edición por administrador)', () => {
  const URL_USUARIO = `${URL}/15`;

  beforeEach(() => {
    usuarioRepository.buscarPorId.mockResolvedValue({ id: 15, rol: 'staff', estado: 'activo' });
    usuarioRepository.buscarIdsPorCodigo.mockResolvedValue({ id_rol: 4, id_estado: 1 });
    usuarioRepository.actualizar.mockResolvedValue({
      id: 15,
      nombre: 'Lucía',
      apellido: 'Gómez',
      documento: '45678901',
      email: 'lucia.gomez@tumo.world',
      rol: 'tutor',
      estado: 'activo',
    });
  });

  test('sin token responde 401', async () => {
    const res = await request(app).patch(URL_USUARIO).send({ nombre: 'Lucía' });

    expect(res.status).toBe(401);
    expect(usuarioRepository.actualizar).not.toHaveBeenCalled();
  });

  test.each(['alumno', 'staff', 'tutor'])('con rol %s responde 403 (RNF12)', async (rol) => {
    const res = await request(app)
      .patch(URL_USUARIO)
      .set('Authorization', `Bearer ${sesion(rol)}`)
      .send({ nombre: 'Lucía' });

    expect(res.status).toBe(403);
    expect(usuarioRepository.actualizar).not.toHaveBeenCalled();
  });

  test('como administrador actualiza datos y rol y responde 200', async () => {
    const res = await request(app)
      .patch(URL_USUARIO)
      .set('Authorization', `Bearer ${sesion('administrador')}`)
      .send({ nombre: 'Lucía María', rol: 'tutor' });

    expect(res.status).toBe(200);
    expect(res.body.usuario).toMatchObject({ id: 15, rol: 'tutor' });
    expect(usuarioRepository.actualizar).toHaveBeenCalledWith(15, {
      nombre: 'Lucía María',
      idRol: 4,
    });
  });

  test.each([
    ['id no numérico', '/abc', { nombre: 'Lucía' }, 'id'],
    ['body vacío', '/15', {}, ''],
    ['email inválido', '/15', { email: 'no-es-email' }, 'email'],
    ['contraseña en el body', '/15', { password: 'OtraClave12345' }, 'password'],
    ['estado en el body', '/15', { estado: 'suspendido' }, 'estado'],
  ])('con %s responde 400 (4.a)', async (_caso, ruta, body, campo) => {
    const res = await request(app)
      .patch(`${URL}${ruta}`)
      .set('Authorization', `Bearer ${sesion('administrador')}`)
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('DATOS_INVALIDOS');
    expect(res.body.detalles.map((d) => d.campo)).toContain(campo);
    expect(usuarioRepository.actualizar).not.toHaveBeenCalled();
  });

  test('si el usuario no existe responde 404', async () => {
    usuarioRepository.buscarPorId.mockResolvedValue(undefined);

    const res = await request(app)
      .patch(`${URL}/999`)
      .set('Authorization', `Bearer ${sesion('administrador')}`)
      .send({ nombre: 'Lucía' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('USUARIO_NO_ENCONTRADO');
  });

  test('el email directo requiere el flujo de verificación', async () => {
    const res = await request(app)
      .patch(URL_USUARIO)
      .set('Authorization', `Bearer ${sesion('administrador')}`)
      .send({ email: 'ana@tumo.world' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('DATOS_INVALIDOS');
    expect(usuarioRepository.actualizar).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/usuarios (CU01 – listado con búsqueda y filtros)', () => {
  beforeEach(() => {
    usuarioRepository.listar.mockResolvedValue({
      usuarios: [{ id: 15, nombre: 'Lucía', email: 'lucia@tumo.world', rol: 'staff', estado: 'activo' }],
      total: 1,
    });
  });

  test('sin token responde 401', async () => {
    const res = await request(app).get(URL);

    expect(res.status).toBe(401);
    expect(usuarioRepository.listar).not.toHaveBeenCalled();
  });

  test.each(['alumno', 'staff', 'tutor'])('con rol %s responde 403 (RNF12)', async (rol) => {
    const res = await request(app).get(URL).set('Authorization', `Bearer ${sesion(rol)}`);

    expect(res.status).toBe(403);
    expect(usuarioRepository.listar).not.toHaveBeenCalled();
  });

  test('como administrador devuelve la primera página con valores por defecto', async () => {
    const res = await request(app)
      .get(URL)
      .set('Authorization', `Bearer ${sesion('administrador')}`);

    expect(res.status).toBe(200);
    expect(res.body.paginacion).toEqual({ pagina: 1, tamanioPagina: 20, total: 1, totalPaginas: 1 });
    expect(res.body.usuarios[0]).not.toHaveProperty('passwordHash');
    expect(usuarioRepository.listar).toHaveBeenCalledWith({
      busqueda: undefined,
      rol: undefined,
      estado: undefined,
      limite: 20,
      offset: 0,
    });
  });

  test('pasa búsqueda, filtros y paginación al repositorio', async () => {
    const res = await request(app)
      .get(URL)
      .query({ busqueda: ' lucia ', rol: 'staff', estado: 'dado_de_baja', pagina: '2', tamanioPagina: '10' })
      .set('Authorization', `Bearer ${sesion('administrador')}`);

    expect(res.status).toBe(200);
    expect(usuarioRepository.listar).toHaveBeenCalledWith({
      busqueda: 'lucia',
      rol: 'staff',
      estado: 'dado_de_baja',
      limite: 10,
      offset: 10,
    });
  });

  test.each([
    ['rol inexistente', { rol: 'superusuario' }, 'rol'],
    ['estado inexistente', { estado: 'borrado' }, 'estado'],
    ['página 0', { pagina: '0' }, 'pagina'],
    ['página no numérica', { pagina: 'dos' }, 'pagina'],
    ['tamaño de página mayor a 100', { tamanioPagina: '500' }, 'tamanioPagina'],
    ['parámetro desconocido', { orden: 'email' }, 'orden'],
  ])('con %s responde 400', async (_caso, query, campo) => {
    const res = await request(app)
      .get(URL)
      .query(query)
      .set('Authorization', `Bearer ${sesion('administrador')}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('DATOS_INVALIDOS');
    expect(res.body.detalles.map((d) => d.campo)).toContain(campo);
    expect(usuarioRepository.listar).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/usuarios/:id/estado (CU01 – flujo 3.b)', () => {
  const URL_ESTADO = `${URL}/15/estado`;

  beforeEach(() => {
    usuarioRepository.buscarPorId.mockResolvedValue({ id: 15, rol: 'staff', estado: 'activo' });
    usuarioRepository.buscarIdEstadoPorCodigo.mockResolvedValue(3);
    usuarioRepository.actualizarEstado.mockResolvedValue({
      id: 15,
      rol: 'staff',
      estado: 'suspendido',
    });
  });

  test('sin token responde 401', async () => {
    const res = await request(app).patch(URL_ESTADO).send({ estado: 'suspendido' });

    expect(res.status).toBe(401);
    expect(usuarioRepository.actualizarEstado).not.toHaveBeenCalled();
  });

  test.each(['alumno', 'staff', 'tutor'])('con rol %s responde 403 (RNF12)', async (rol) => {
    const res = await request(app)
      .patch(URL_ESTADO)
      .set('Authorization', `Bearer ${sesion(rol)}`)
      .send({ estado: 'suspendido' });

    expect(res.status).toBe(403);
    expect(usuarioRepository.actualizarEstado).not.toHaveBeenCalled();
  });

  test('como administrador cambia el estado y responde 200', async () => {
    const res = await request(app)
      .patch(URL_ESTADO)
      .set('Authorization', `Bearer ${sesion('administrador')}`)
      .send({ estado: 'suspendido' });

    expect(res.status).toBe(200);
    expect(res.body.usuario).toMatchObject({ id: 15, estado: 'suspendido' });
    expect(usuarioRepository.buscarIdEstadoPorCodigo).toHaveBeenCalledWith('suspendido');
    expect(usuarioRepository.actualizarEstado).toHaveBeenCalledWith(15, 3);
  });

  test.each([
    ['un estado inexistente', '/15/estado', { estado: 'borrado' }, 'estado'],
    ['pendiente_verificacion', '/15/estado', { estado: 'pendiente_verificacion' }, 'estado'],
    ['sin estado', '/15/estado', {}, 'estado'],
    ['campos extra', '/15/estado', { estado: 'activo', rol: 'staff' }, 'rol'],
    ['id no numérico', '/abc/estado', { estado: 'activo' }, 'id'],
  ])('con %s responde 400', async (_caso, ruta, body, campo) => {
    const res = await request(app)
      .patch(`${URL}${ruta}`)
      .set('Authorization', `Bearer ${sesion('administrador')}`)
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('DATOS_INVALIDOS');
    expect(res.body.detalles.map((d) => d.campo)).toContain(campo);
    expect(usuarioRepository.actualizarEstado).not.toHaveBeenCalled();
  });

  test('el administrador no puede cambiar su propio estado', async () => {
    const res = await request(app)
      .patch(`${URL}/1/estado`)
      .set('Authorization', `Bearer ${sesion('administrador')}`)
      .send({ estado: 'inactivo' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('AUTO_CAMBIO_ESTADO');
    expect(usuarioRepository.actualizarEstado).not.toHaveBeenCalled();
  });

  test('si el usuario no existe responde 404', async () => {
    usuarioRepository.buscarPorId.mockResolvedValue(undefined);

    const res = await request(app)
      .patch(`${URL}/999/estado`)
      .set('Authorization', `Bearer ${sesion('administrador')}`)
      .send({ estado: 'dado_de_baja' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('USUARIO_NO_ENCONTRADO');
  });
});

describe('POST /api/v1/usuarios/:id/restablecer-password (CU01 – flujo 3.a)', () => {
  const { passwordSchema } = require('../../src/server/v1/validators/password.validator');
  const URL_RESTABLECER = `${URL}/15/restablecer-password`;

  beforeEach(() => {
    usuarioRepository.buscarPorId.mockResolvedValue({ id: 15, rol: 'staff', estado: 'activo' });
    usuarioRepository.restablecerPasswordTemporal.mockResolvedValue({
      id: 15,
      rol: 'staff',
      estado: 'activo',
    });
  });

  test('sin token responde 401', async () => {
    const res = await request(app).post(URL_RESTABLECER);

    expect(res.status).toBe(401);
    expect(usuarioRepository.restablecerPasswordTemporal).not.toHaveBeenCalled();
  });

  test.each(['alumno', 'staff', 'tutor'])('con rol %s responde 403 (RNF12)', async (rol) => {
    const res = await request(app)
      .post(URL_RESTABLECER)
      .set('Authorization', `Bearer ${sesion(rol)}`);

    expect(res.status).toBe(403);
    expect(usuarioRepository.restablecerPasswordTemporal).not.toHaveBeenCalled();
  });

  test('como administrador devuelve la temporal una vez y sin caché', async () => {
    const res = await request(app)
      .post(URL_RESTABLECER)
      .set('Authorization', `Bearer ${sesion('administrador')}`);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.usuario).toMatchObject({ id: 15 });
    expect(res.body.usuario).not.toHaveProperty('passwordHash');
    expect(passwordSchema.validate(res.body.passwordTemporal).error).toBeUndefined();

    const [, hash] = usuarioRepository.restablecerPasswordTemporal.mock.calls[0];
    expect(hash).not.toBe(res.body.passwordTemporal);
  });

  test('con id inválido responde 400', async () => {
    const res = await request(app)
      .post(`${URL}/abc/restablecer-password`)
      .set('Authorization', `Bearer ${sesion('administrador')}`);

    expect(res.status).toBe(400);
    expect(res.body.detalles.map((d) => d.campo)).toContain('id');
  });

  test('el administrador no puede restablecer su propia contraseña', async () => {
    const res = await request(app)
      .post(`${URL}/1/restablecer-password`)
      .set('Authorization', `Bearer ${sesion('administrador')}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('AUTO_RESTABLECER_PASSWORD');
  });

  test('si el usuario no existe responde 404', async () => {
    usuarioRepository.buscarPorId.mockResolvedValue(undefined);

    const res = await request(app)
      .post(`${URL}/999/restablecer-password`)
      .set('Authorization', `Bearer ${sesion('administrador')}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('USUARIO_NO_ENCONTRADO');
  });
});
