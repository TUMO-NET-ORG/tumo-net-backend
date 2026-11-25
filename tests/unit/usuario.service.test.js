jest.mock('../../src/server/v1/repositories/usuario.repository');
jest.mock('../../src/server/v1/repositories/auth.repository');
jest.mock('../../src/server/v1/repositories/grupo.repository');
jest.mock('../../src/server/v1/services/mail.service');

const argon2 = require('argon2');
const usuarioRepository = require('../../src/server/v1/repositories/usuario.repository');
const grupoRepository = require('../../src/server/v1/repositories/grupo.repository');
const mailService = require('../../src/server/v1/services/mail.service');
const {
  cambiarEstadoPorAdmin,
  crearUsuarioPorAdmin,
  editarUsuarioPorAdmin,
  generarPasswordTemporal,
  listarUsuarios,
  restablecerPasswordPorAdmin,
} = require('../../src/server/v1/services/usuario.service');

function datosAlta(cambios = {}) {
  return {
    nombre: 'Lucía',
    apellido: 'Gómez',
    documento: '45678905',
    email: 'lucia@tumo.world',
    rol: 'tutor',
    ...cambios,
  };
}

function usuarioCreado(cambios = {}) {
  return {
    id: 15,
    nombre: 'Lucía',
    apellido: 'Gómez',
    documento: '45678905',
    email: 'lucia@tumo.world',
    rol: 'tutor',
    estado: 'pendiente_verificacion',
    ...cambios,
  };
}

function errorDuplicado(indice) {
  const error = new Error(`Duplicate entry 'x' for key 'usuarios.${indice}'`);
  error.code = 'ER_DUP_ENTRY';
  error.sqlMessage = error.message;
  return error;
}

describe('crearUsuarioPorAdmin (CU01 – alta individual, RF1)', () => {
  beforeEach(() => {
    usuarioRepository.buscarIdsPorCodigo.mockResolvedValue({ id_rol: 4, id_estado: 4 });
    usuarioRepository.crearPendientePorAdmin.mockResolvedValue(usuarioCreado());
  });

  test('crea el usuario pendiente con el rol indicado y lo devuelve', async () => {
    const usuario = await crearUsuarioPorAdmin(datosAlta());

    expect(usuarioRepository.buscarIdsPorCodigo).toHaveBeenCalledWith('tutor', 'pendiente_verificacion');
    expect(usuarioRepository.crearPendientePorAdmin).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre: 'Lucía',
        email: 'lucia@tumo.world',
        idRol: 4,
        idEstado: 4,
      }),
    );
    expect(usuario).toEqual(usuarioCreado());
  });

  test('guarda la contraseña con hash argon2, nunca en texto plano (RNF07)', async () => {
    await crearUsuarioPorAdmin(datosAlta());

    const guardado = usuarioRepository.crearPendientePorAdmin.mock.calls[0][0];
    expect(guardado).not.toHaveProperty('password');
    expect(JSON.stringify(guardado)).not.toContain('Inicial12345');
    expect(guardado.passwordHash).toMatch(/^\$argon2/);
  });

  test('envía una invitación por mail', async () => {
    await crearUsuarioPorAdmin(datosAlta());

    expect(mailService.enviarEnlaceAccion).toHaveBeenCalledWith(
      'lucia@tumo.world',
      expect.any(String),
      'invitacion',
    );
  });

  test('con un email ya registrado responde 409 EMAIL_DUPLICADO', async () => {
    usuarioRepository.crearPendientePorAdmin.mockRejectedValue(errorDuplicado('uk_usuario_email'));

    await expect(crearUsuarioPorAdmin(datosAlta())).rejects.toMatchObject({
      statusCode: 409,
      code: 'EMAIL_DUPLICADO',
    });
  });

  test('con un documento ya registrado responde 409 DOCUMENTO_DUPLICADO', async () => {
    usuarioRepository.crearPendientePorAdmin.mockRejectedValue(errorDuplicado('uk_usuario_documento'));

    await expect(crearUsuarioPorAdmin(datosAlta())).rejects.toMatchObject({
      statusCode: 409,
      code: 'DOCUMENTO_DUPLICADO',
    });
  });

  test('si el rol no existe en la base responde 400 ROL_INVALIDO', async () => {
    usuarioRepository.buscarIdsPorCodigo.mockResolvedValue({ id_rol: null, id_estado: 1 });

    await expect(crearUsuarioPorAdmin(datosAlta())).rejects.toMatchObject({
      statusCode: 400,
      code: 'ROL_INVALIDO',
    });
    expect(usuarioRepository.crearPendientePorAdmin).not.toHaveBeenCalled();
  });

  test('si falta el estado pendiente en la base responde 500 de configuración', async () => {
    usuarioRepository.buscarIdsPorCodigo.mockResolvedValue({ id_rol: 4, id_estado: null });

    await expect(crearUsuarioPorAdmin(datosAlta())).rejects.toMatchObject({
      statusCode: 500,
      code: 'CONFIGURACION_USUARIO_INCOMPLETA',
    });
  });

  test('propaga los errores inesperados de la base', async () => {
    usuarioRepository.crearPendientePorAdmin.mockRejectedValue(new Error('conexión perdida'));

    await expect(crearUsuarioPorAdmin(datosAlta())).rejects.toThrow('conexión perdida');
  });
});

describe('editarUsuarioPorAdmin (CU01 – edición por el administrador, RF1)', () => {
  const admin = { id: 1, rol: 'administrador' };

  beforeEach(() => {
    usuarioRepository.buscarPorId.mockResolvedValue(usuarioCreado());
    usuarioRepository.buscarIdsPorCodigo.mockResolvedValue({ id_rol: 2, id_estado: 1 });
    usuarioRepository.actualizar.mockResolvedValue(usuarioCreado({ nombre: 'Lucía María' }));
  });

  test('actualiza los datos indicados y devuelve el usuario', async () => {
    const usuario = await editarUsuarioPorAdmin(15, { nombre: 'Lucía María' }, admin);

    expect(usuarioRepository.actualizar).toHaveBeenCalledWith(15, { nombre: 'Lucía María' });
    expect(usuarioRepository.buscarIdsPorCodigo).not.toHaveBeenCalled();
    expect(usuario.nombre).toBe('Lucía María');
  });

  test('traduce el rol a su id para cambiar un dato que el alumno no puede editar', async () => {
    grupoRepository.buscarGruposDondeEsResponsable.mockResolvedValue([]);

    await editarUsuarioPorAdmin(15, { rol: 'alumno', email: 'otra@tumo.world' }, admin);

    expect(usuarioRepository.buscarIdsPorCodigo).toHaveBeenCalledWith('alumno', 'activo');
    expect(usuarioRepository.actualizar).toHaveBeenCalledWith(15, {
      email: 'otra@tumo.world',
      idRol: 2,
    });
  });

  test('no deja pasar a alumno a quien es responsable de algún grupo', async () => {
    const grupos = [{ id: 7, nombre: 'Robótica' }];
    grupoRepository.buscarGruposDondeEsResponsable.mockResolvedValue(grupos);

    await expect(editarUsuarioPorAdmin(15, { rol: 'alumno' }, admin)).rejects.toMatchObject({
      statusCode: 409,
      code: 'RESPONSABLE_DE_GRUPOS',
      extra: { grupos },
    });
    expect(grupoRepository.buscarGruposDondeEsResponsable).toHaveBeenCalledWith(15);
    expect(usuarioRepository.actualizar).not.toHaveBeenCalled();
  });

  test.each(['staff', 'tutor', 'administrador'])(
    'pasar a %s no mira los grupos: sigue pudiendo ser responsable',
    async (rol) => {
      await editarUsuarioPorAdmin(15, { rol }, admin);

      expect(grupoRepository.buscarGruposDondeEsResponsable).not.toHaveBeenCalled();
      expect(usuarioRepository.actualizar).toHaveBeenCalled();
    },
  );

  test('si el usuario no existe responde 404 y no actualiza', async () => {
    usuarioRepository.buscarPorId.mockResolvedValue(undefined);

    await expect(editarUsuarioPorAdmin(99, { nombre: 'X' }, admin)).rejects.toMatchObject({
      statusCode: 404,
      code: 'USUARIO_NO_ENCONTRADO',
    });
    expect(usuarioRepository.actualizar).not.toHaveBeenCalled();
  });

  test('con un email de otro usuario responde 409 EMAIL_DUPLICADO', async () => {
    usuarioRepository.actualizar.mockRejectedValue(errorDuplicado('uk_usuario_email'));

    await expect(
      editarUsuarioPorAdmin(15, { email: 'ana@tumo.world' }, admin),
    ).rejects.toMatchObject({ statusCode: 409, code: 'EMAIL_DUPLICADO' });
  });

  test('con un documento de otro usuario responde 409 DOCUMENTO_DUPLICADO', async () => {
    usuarioRepository.actualizar.mockRejectedValue(errorDuplicado('uk_usuario_documento'));

    await expect(
      editarUsuarioPorAdmin(15, { documento: '12345672' }, admin),
    ).rejects.toMatchObject({ statusCode: 409, code: 'DOCUMENTO_DUPLICADO' });
  });

  test('si el rol no existe en la base responde 400 ROL_INVALIDO', async () => {
    usuarioRepository.buscarIdsPorCodigo.mockResolvedValue({ id_rol: null, id_estado: 1 });

    await expect(editarUsuarioPorAdmin(15, { rol: 'staff' }, admin)).rejects.toMatchObject({
      statusCode: 400,
      code: 'ROL_INVALIDO',
    });
    expect(usuarioRepository.actualizar).not.toHaveBeenCalled();
  });

  test('el administrador no puede quitarse a sí mismo el rol (AUTO_CAMBIO_ROL)', async () => {
    await expect(editarUsuarioPorAdmin(1, { rol: 'staff' }, admin)).rejects.toMatchObject({
      statusCode: 400,
      code: 'AUTO_CAMBIO_ROL',
    });
    expect(usuarioRepository.actualizar).not.toHaveBeenCalled();
  });

  test('el administrador sí puede editar sus otros datos', async () => {
    await editarUsuarioPorAdmin(1, { nombre: 'Admin', rol: 'administrador' }, admin);

    expect(usuarioRepository.actualizar).toHaveBeenCalled();
  });
});

describe('listarUsuarios (CU01 – listado, flujo principal paso 2)', () => {
  test('calcula offset y totalPaginas y pasa los filtros al repositorio', async () => {
    usuarioRepository.listar.mockResolvedValue({ usuarios: [usuarioCreado()], total: 45 });

    const resultado = await listarUsuarios({
      busqueda: 'lucia',
      rol: 'tutor',
      estado: 'activo',
      pagina: 3,
      tamanioPagina: 20,
    });

    expect(usuarioRepository.listar).toHaveBeenCalledWith({
      busqueda: 'lucia',
      rol: 'tutor',
      estado: 'activo',
      limite: 20,
      offset: 40,
    });
    expect(resultado).toEqual({
      usuarios: [usuarioCreado()],
      paginacion: { pagina: 3, tamanioPagina: 20, total: 45, totalPaginas: 3 },
    });
  });

  test('una página fuera de rango devuelve lista vacía con el total real', async () => {
    usuarioRepository.listar.mockResolvedValue({ usuarios: [], total: 5 });

    const resultado = await listarUsuarios({ pagina: 4, tamanioPagina: 5 });

    expect(usuarioRepository.listar).toHaveBeenCalledWith(
      expect.objectContaining({ limite: 5, offset: 15 }),
    );
    expect(resultado.usuarios).toEqual([]);
    expect(resultado.paginacion).toEqual({ pagina: 4, tamanioPagina: 5, total: 5, totalPaginas: 1 });
  });

  test('sin resultados informa 0 páginas', async () => {
    usuarioRepository.listar.mockResolvedValue({ usuarios: [], total: 0 });

    const resultado = await listarUsuarios({ pagina: 1, tamanioPagina: 20 });

    expect(resultado.paginacion).toMatchObject({ total: 0, totalPaginas: 0 });
  });
});

describe('cambiarEstadoPorAdmin (CU01 – flujo 3.b, RF2)', () => {
  const admin = { id: 1, rol: 'administrador' };

  beforeEach(() => {
    usuarioRepository.buscarPorId.mockResolvedValue(usuarioCreado());
    usuarioRepository.buscarIdEstadoPorCodigo.mockResolvedValue(3);
  });

  test.each(['activo', 'inactivo', 'suspendido'])(
    'cambia el estado a %s con un UPDATE y devuelve el usuario',
    async (estado) => {
      usuarioRepository.actualizarEstado.mockResolvedValue(usuarioCreado({ estado }));

      const usuario = await cambiarEstadoPorAdmin(15, estado, admin);

      expect(usuarioRepository.buscarIdEstadoPorCodigo).toHaveBeenCalledWith(estado);
      expect(usuarioRepository.actualizarEstado).toHaveBeenCalledWith(15, 3);
      expect(usuario.estado).toBe(estado);
    },
  );

  test('al dar de baja usa la transacción que también lo saca de sus grupos', async () => {
    usuarioRepository.darDeBajaYQuitarDeGrupos.mockResolvedValue({
      usuario: usuarioCreado({ estado: 'dado_de_baja' }),
    });

    const usuario = await cambiarEstadoPorAdmin(15, 'dado_de_baja', admin);

    expect(usuarioRepository.darDeBajaYQuitarDeGrupos).toHaveBeenCalledWith(15, 3);
    expect(usuarioRepository.actualizarEstado).not.toHaveBeenCalled();
    expect(usuario.estado).toBe('dado_de_baja');
  });

  test('si es el único responsable de algún grupo responde 409 con esos grupos', async () => {
    const grupos = [{ id: 7, nombre: 'Robótica' }, { id: 9, nombre: 'Diseño 3D' }];
    usuarioRepository.darDeBajaYQuitarDeGrupos.mockResolvedValue({
      gruposSinOtroResponsable: grupos,
    });

    await expect(cambiarEstadoPorAdmin(15, 'dado_de_baja', admin)).rejects.toMatchObject({
      statusCode: 409,
      code: 'UNICO_RESPONSABLE_DE_GRUPOS',
      message: expect.stringContaining('Robótica, Diseño 3D'),
      extra: { grupos },
    });
  });

  test.each(['activo', 'inactivo', 'suspendido'])(
    'al pasar a %s no lo saca de sus grupos',
    async (estado) => {
      usuarioRepository.actualizarEstado.mockResolvedValue(usuarioCreado({ estado }));

      await cambiarEstadoPorAdmin(15, estado, admin);

      expect(usuarioRepository.darDeBajaYQuitarDeGrupos).not.toHaveBeenCalled();
    },
  );

  test('el administrador no puede cambiar su propio estado', async () => {
    await expect(cambiarEstadoPorAdmin(1, 'inactivo', admin)).rejects.toMatchObject({
      statusCode: 400,
      code: 'AUTO_CAMBIO_ESTADO',
    });
    expect(usuarioRepository.actualizarEstado).not.toHaveBeenCalled();
  });

  test('si el usuario no existe responde 404', async () => {
    usuarioRepository.buscarPorId.mockResolvedValue(undefined);

    await expect(cambiarEstadoPorAdmin(99, 'suspendido', admin)).rejects.toMatchObject({
      statusCode: 404,
      code: 'USUARIO_NO_ENCONTRADO',
    });
    expect(usuarioRepository.actualizarEstado).not.toHaveBeenCalled();
  });

  test('si el estado no está cargado en la base responde 500 de configuración', async () => {
    usuarioRepository.buscarIdEstadoPorCodigo.mockResolvedValue(null);

    await expect(cambiarEstadoPorAdmin(15, 'dado_de_baja', admin)).rejects.toMatchObject({
      statusCode: 500,
      code: 'CONFIGURACION_USUARIO_INCOMPLETA',
    });
    expect(usuarioRepository.actualizarEstado).not.toHaveBeenCalled();
  });
});

describe('generarPasswordTemporal (CU01 – flujo 3.a)', () => {
  const { passwordSchema } = require('../../src/server/v1/validators/password.validator');

  test('genera 16 caracteres sin caracteres ambiguos y cumple la política (RNF07)', () => {
    for (let i = 0; i < 200; i += 1) {
      const password = generarPasswordTemporal();

      expect(password).toHaveLength(16);
      expect(password).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/\d/);
      expect(passwordSchema.validate(password).error).toBeUndefined();
    }
  });

  test('es aleatoria: no se repite', () => {
    const generadas = new Set(Array.from({ length: 500 }, () => generarPasswordTemporal()));

    expect(generadas.size).toBe(500);
  });
});

describe('restablecerPasswordPorAdmin (CU01 – flujo 3.a, RF4)', () => {
  const admin = { id: 1, rol: 'administrador' };

  beforeEach(() => {
    usuarioRepository.buscarPorId.mockResolvedValue(usuarioCreado());
    usuarioRepository.restablecerPasswordTemporal.mockResolvedValue(usuarioCreado());
  });

  test('devuelve la temporal y guarda solo su hash argon2 (RNF07)', async () => {
    const { usuario, passwordTemporal } = await restablecerPasswordPorAdmin(15, admin);

    const [id, hash] = usuarioRepository.restablecerPasswordTemporal.mock.calls[0];
    expect(id).toBe(15);
    expect(hash).toMatch(/^\$argon2/);
    expect(hash).not.toContain(passwordTemporal);
    await expect(argon2.verify(hash, passwordTemporal)).resolves.toBe(true);
    expect(usuario).toEqual(usuarioCreado());
  });

  test('cada restablecimiento genera una temporal distinta', async () => {
    const primera = await restablecerPasswordPorAdmin(15, admin);
    const segunda = await restablecerPasswordPorAdmin(15, admin);

    expect(primera.passwordTemporal).not.toBe(segunda.passwordTemporal);
  });

  test('el administrador no puede restablecer su propia contraseña', async () => {
    await expect(restablecerPasswordPorAdmin(1, admin)).rejects.toMatchObject({
      statusCode: 400,
      code: 'AUTO_RESTABLECER_PASSWORD',
    });
    expect(usuarioRepository.restablecerPasswordTemporal).not.toHaveBeenCalled();
  });

  test('si el usuario no existe responde 404', async () => {
    usuarioRepository.buscarPorId.mockResolvedValue(undefined);

    await expect(restablecerPasswordPorAdmin(99, admin)).rejects.toMatchObject({
      statusCode: 404,
      code: 'USUARIO_NO_ENCONTRADO',
    });
    expect(usuarioRepository.restablecerPasswordTemporal).not.toHaveBeenCalled();
  });
});
