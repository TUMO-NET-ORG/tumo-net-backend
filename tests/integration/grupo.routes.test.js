// Pruebas de integración de los grupos: listar, ver, crear, editar y borrar.
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

function sesion(rol, id = 1) {
  authRepository.buscarActivoPorId.mockResolvedValue({
    id,
    nombre: 'Admin',
    apellido: 'TUMO',
    email: 'admin@tumo.world',
    passwordVersion: 0,
    rol,
    estado: 'activo',
  });

  return jwt.sign({ sub: String(id), rol, passwordVersion: 0 }, process.env.JWT_SECRET, {
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

const GRUPO = { id: 10, nombre: 'Taller de robótica', descripcion: 'Turno mañana' };

function como(rol, id = 1) {
  return { Authorization: `Bearer ${sesion(rol, id)}` };
}

describe('GET /api/v1/grupos', () => {
  beforeEach(() => {
    grupoRepository.listar.mockResolvedValue({ grupos: [GRUPO], total: 1 });
  });

  test('sin token responde 401', async () => {
    const res = await request(app).get(URL);

    expect(res.status).toBe(401);
    expect(grupoRepository.listar).not.toHaveBeenCalled();
  });

  test('un administrador lista todos los grupos con la paginación por defecto', async () => {
    const res = await request(app).get(URL).set(como('administrador'));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      grupos: [GRUPO],
      paginacion: { pagina: 1, limite: 20, total: 1, totalPaginas: 1 },
    });
    expect(grupoRepository.listar).toHaveBeenCalledWith({
      soloDelUsuario: null,
      buscar: undefined,
      limite: 20,
      offset: 0,
    });
  });

  test('un alumno puede listar, pero solo ve sus grupos', async () => {
    const res = await request(app).get(URL).set(como('alumno', 3));

    expect(res.status).toBe(200);
    expect(grupoRepository.listar).toHaveBeenCalledWith(
      expect.objectContaining({ soloDelUsuario: 3 }),
    );
  });

  test('convierte los parámetros de la query y calcula el offset', async () => {
    const res = await request(app)
      .get(`${URL}?pagina=3&limite=5&buscar=%20robo%20`)
      .set(como('administrador'));

    expect(res.status).toBe(200);
    expect(grupoRepository.listar).toHaveBeenCalledWith({
      soloDelUsuario: null,
      buscar: 'robo',
      limite: 5,
      offset: 10,
    });
  });

  test('con parámetros inválidos responde 400', async () => {
    const res = await request(app).get(`${URL}?pagina=0&limite=500`).set(como('administrador'));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('DATOS_INVALIDOS');
    expect(res.body.detalles.map((d) => d.campo)).toEqual(
      expect.arrayContaining(['pagina', 'limite']),
    );
    expect(grupoRepository.listar).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/grupos/:id', () => {
  beforeEach(() => {
    grupoRepository.buscarPorId.mockResolvedValue(GRUPO);
    grupoRepository.esIntegrante.mockResolvedValue(true);
    grupoRepository.buscarIntegrantes.mockResolvedValue([
      { id: 2, nombre: 'Ana', apellido: 'Tutor', rol: 'tutor', es_responsable: 1 },
      { id: 3, nombre: 'Beto', apellido: 'Alumno', rol: 'alumno', es_responsable: 0 },
    ]);
  });

  test('sin token responde 401', async () => {
    const res = await request(app).get(`${URL}/10`);

    expect(res.status).toBe(401);
  });

  test('un integrante ve el detalle con responsables e integrantes', async () => {
    const res = await request(app).get(`${URL}/10`).set(como('alumno', 3));

    expect(res.status).toBe(200);
    expect(res.body.grupo).toEqual({
      ...GRUPO,
      responsables: [{ id: 2, nombre: 'Ana', apellido: 'Tutor', rol: 'tutor' }],
      integrantes: [{ id: 3, nombre: 'Beto', apellido: 'Alumno', rol: 'alumno' }],
    });
    expect(grupoRepository.esIntegrante).toHaveBeenCalledWith(10, 3);
  });

  test('alguien que no está en el grupo recibe 403', async () => {
    grupoRepository.esIntegrante.mockResolvedValue(false);

    const res = await request(app).get(`${URL}/10`).set(como('alumno', 7));

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('SIN_PERMISO_GRUPO');
  });

  test('un grupo inexistente responde 404', async () => {
    grupoRepository.buscarPorId.mockResolvedValue(null);

    const res = await request(app).get(`${URL}/999`).set(como('administrador'));

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('GRUPO_NO_ENCONTRADO');
  });

  test('un id que no es número responde 400', async () => {
    const res = await request(app).get(`${URL}/abc`).set(como('administrador'));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('DATOS_INVALIDOS');
    expect(grupoRepository.buscarPorId).not.toHaveBeenCalled();
  });
});

describe('PUT /api/v1/grupos/:id', () => {
  beforeEach(() => {
    grupoRepository.buscarUsuariosConRol.mockImplementation(async (ids) =>
      USUARIOS.filter((u) => ids.includes(u.id)),
    );
    grupoRepository.buscarPorId.mockResolvedValue(GRUPO);
    grupoRepository.esResponsable.mockResolvedValue(true);
    grupoRepository.actualizar.mockResolvedValue({ agregados: [] });
  });

  function editarComo(rol, id, datos = cuerpo({ nombre: 'Robótica avanzada' }), grupoId = 10) {
    return request(app).put(`${URL}/${grupoId}`).set(como(rol, id)).send(datos);
  }

  test('sin token responde 401', async () => {
    const res = await request(app).put(`${URL}/10`).send(cuerpo());

    expect(res.status).toBe(401);
    expect(grupoRepository.actualizar).not.toHaveBeenCalled();
  });

  test('un alumno responde 403', async () => {
    const res = await editarComo('alumno', 3);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('SIN_PERMISO');
  });

  test('un tutor responsable edita el grupo y responde 200', async () => {
    const res = await editarComo('tutor', 2);

    expect(res.status).toBe(200);
    expect(res.body.grupo).toEqual({
      id: 10,
      nombre: 'Robótica avanzada',
      descripcion: 'Turno mañana',
      responsables: [2],
      integrantes: [3],
    });
    expect(grupoRepository.esResponsable).toHaveBeenCalledWith(10, 2);
  });

  test('un tutor que no es responsable recibe 403', async () => {
    grupoRepository.esResponsable.mockResolvedValue(false);

    const res = await editarComo('tutor', 8);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('SIN_PERMISO_GRUPO');
    expect(grupoRepository.actualizar).not.toHaveBeenCalled();
  });

  test('un administrador edita cualquier grupo', async () => {
    const res = await editarComo('administrador', 1);

    expect(res.status).toBe(200);
    expect(grupoRepository.esResponsable).not.toHaveBeenCalled();
  });

  test('con datos inválidos responde 400', async () => {
    const res = await editarComo('administrador', 1, { nombre: 'ab' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('DATOS_INVALIDOS');
    expect(grupoRepository.buscarPorId).not.toHaveBeenCalled();
  });

  test('con un usuario dado de baja responde 400', async () => {
    const res = await editarComo('administrador', 1, cuerpo({ integrantes: [3, 4] }));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('USUARIOS_DADOS_DE_BAJA');
    expect(grupoRepository.actualizar).not.toHaveBeenCalled();
  });

  test('un grupo inexistente responde 404', async () => {
    grupoRepository.buscarPorId.mockResolvedValue(null);

    const res = await editarComo('administrador', 1, cuerpo(), 999);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('GRUPO_NO_ENCONTRADO');
  });

  test('con un nombre que usa otro grupo responde 409', async () => {
    const duplicado = new Error("Duplicate entry for key 'grupos.uk_grupo_nombre'");
    duplicado.code = 'ER_DUP_ENTRY';
    grupoRepository.actualizar.mockRejectedValue(duplicado);

    const res = await editarComo('administrador', 1);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('GRUPO_YA_EXISTE');
  });
});

describe('DELETE /api/v1/grupos/:id', () => {
  beforeEach(() => {
    grupoRepository.buscarPorId.mockResolvedValue(GRUPO);
    grupoRepository.esResponsable.mockResolvedValue(true);
    grupoRepository.darDeBaja.mockResolvedValue(true);
  });

  test('sin token responde 401', async () => {
    const res = await request(app).delete(`${URL}/10`);

    expect(res.status).toBe(401);
    expect(grupoRepository.darDeBaja).not.toHaveBeenCalled();
  });

  test('un alumno responde 403', async () => {
    const res = await request(app).delete(`${URL}/10`).set(como('alumno', 3));

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('SIN_PERMISO');
  });

  test('un responsable da de baja el grupo y responde 204 sin cuerpo', async () => {
    const res = await request(app).delete(`${URL}/10`).set(como('staff', 2));

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
    expect(grupoRepository.darDeBaja).toHaveBeenCalledWith(10);
  });

  test('un staff que no es responsable recibe 403', async () => {
    grupoRepository.esResponsable.mockResolvedValue(false);

    const res = await request(app).delete(`${URL}/10`).set(como('staff', 8));

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('SIN_PERMISO_GRUPO');
    expect(grupoRepository.darDeBaja).not.toHaveBeenCalled();
  });

  test('un grupo inexistente o ya borrado responde 404', async () => {
    grupoRepository.buscarPorId.mockResolvedValue(null);

    const res = await request(app).delete(`${URL}/10`).set(como('administrador'));

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('GRUPO_NO_ENCONTRADO');
  });
});
