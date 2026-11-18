// Pruebas de integración de la creación de grupos.
// Recorren ruta, middlewares, validador, controlador y servicio reales;
// solo se reemplazan los repositorios (base de datos).
jest.mock('../../src/server/v1/repositories/auth.repository');
jest.mock('../../src/server/v1/repositories/grupo.repository');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const authRepository = require('../../src/server/v1/repositories/auth.repository');
const grupoRepository = require('../../src/server/v1/repositories/grupo.repository');

const URL = '/api/v1/grupos';

const USUARIOS = [
  { id: 2, rol: 'tutor', estado: 'activo' },
  { id: 3, rol: 'alumno', estado: 'activo' },
  { id: 4, rol: 'alumno', estado: 'dado_de_baja' },
];

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
    nombre: 'Taller de robótica',
    descripcion: 'Turno mañana',
    responsables: [2],
    integrantes: [3],
    ...cambios,
  };
}

function crearGrupoComo(rol, datos = cuerpo()) {
  return request(app).post(URL).set('Authorization', `Bearer ${sesion(rol)}`).send(datos);
}

describe('POST /api/v1/grupos', () => {
  beforeEach(() => {
    grupoRepository.buscarUsuariosConRol.mockImplementation(async (ids) =>
      USUARIOS.filter((u) => ids.includes(u.id)),
    );
    grupoRepository.crear.mockResolvedValue(10);
  });

  test('sin token responde 401', async () => {
    const res = await request(app).post(URL).send(cuerpo());

    expect(res.status).toBe(401);
    expect(grupoRepository.crear).not.toHaveBeenCalled();
  });

  test('con rol alumno responde 403', async () => {
    const res = await crearGrupoComo('alumno');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('SIN_PERMISO');
    expect(grupoRepository.crear).not.toHaveBeenCalled();
  });

  test.each(['administrador', 'staff', 'tutor'])('con rol %s crea el grupo y responde 201', async (rol) => {
    const res = await crearGrupoComo(rol);

    expect(res.status).toBe(201);
    expect(res.body.grupo).toEqual({
      id: 10,
      nombre: 'Taller de robótica',
      descripcion: 'Turno mañana',
      responsables: [2],
      integrantes: [3],
    });
    // El creador queda registrado aunque no sea responsable del grupo
    expect(grupoRepository.crear).toHaveBeenCalledWith(
      expect.objectContaining({ creadoPor: 1, responsables: [2] }),
    );
  });

  test('sin descripción ni integrantes crea el grupo igual', async () => {
    const res = await crearGrupoComo('administrador', {
      nombre: 'Grupo nuevo',
      responsables: [2],
    });

    expect(res.status).toBe(201);
    expect(res.body.grupo).toMatchObject({ descripcion: null, integrantes: [] });
  });

  test('ignora campos que no están en el esquema', async () => {
    const res = await crearGrupoComo('administrador', cuerpo({ creadoPor: 99, id: 500 }));

    expect(res.status).toBe(201);
    expect(grupoRepository.crear).toHaveBeenCalledWith(expect.objectContaining({ creadoPor: 1 }));
  });

  test('con datos faltantes o inválidos responde 400 con el detalle', async () => {
    const res = await crearGrupoComo('administrador', { nombre: 'ab', integrantes: [3, 3] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('DATOS_INVALIDOS');
    const campos = res.body.detalles.map((d) => d.campo);
    expect(campos).toEqual(expect.arrayContaining(['nombre', 'responsables']));
    expect(campos.some((c) => c.startsWith('integrantes'))).toBe(true);
    expect(grupoRepository.crear).not.toHaveBeenCalled();
  });

  test('sin responsables responde 400', async () => {
    const res = await crearGrupoComo('administrador', cuerpo({ responsables: [] }));

    expect(res.status).toBe(400);
    expect(res.body.detalles[0].mensaje).toBe('El grupo necesita al menos un responsable');
  });

  test('con un usuario dado de baja responde 400', async () => {
    const res = await crearGrupoComo('administrador', cuerpo({ integrantes: [3, 4] }));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('USUARIOS_DADOS_DE_BAJA');
    expect(grupoRepository.crear).not.toHaveBeenCalled();
  });

  test('con un usuario inexistente responde 400', async () => {
    const res = await crearGrupoComo('administrador', cuerpo({ integrantes: [99] }));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('USUARIOS_INEXISTENTES');
  });

  test('con un alumno como responsable responde 400', async () => {
    const res = await crearGrupoComo('administrador', cuerpo({ responsables: [3], integrantes: [] }));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('RESPONSABLE_ROL_INVALIDO');
  });

  test('con un usuario en las dos listas responde 400', async () => {
    const res = await crearGrupoComo('administrador', cuerpo({ integrantes: [2] }));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INTEGRANTE_DUPLICADO');
  });

  test('con un nombre ya usado responde 409', async () => {
    const duplicado = new Error("Duplicate entry for key 'grupos.uk_grupo_nombre'");
    duplicado.code = 'ER_DUP_ENTRY';
    grupoRepository.crear.mockRejectedValue(duplicado);

    const res = await crearGrupoComo('administrador');

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('GRUPO_YA_EXISTE');
  });
});
