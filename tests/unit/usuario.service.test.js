jest.mock('../../src/server/v1/repositories/usuario.repository');
jest.mock('../../src/server/v1/repositories/auth.repository');
jest.mock('../../src/server/v1/services/mail.service');

const argon2 = require('argon2');
const usuarioRepository = require('../../src/server/v1/repositories/usuario.repository');
const mailService = require('../../src/server/v1/services/mail.service');
const {
  crearUsuarioPorAdmin,
  editarUsuarioPorAdmin,
} = require('../../src/server/v1/services/usuario.service');

function datosAlta(cambios = {}) {
  return {
    nombre: 'Lucía',
    apellido: 'Gómez',
    documento: '45678901',
    email: 'lucia@tumo.world',
    password: 'Inicial12345',
    rol: 'tutor',
    ...cambios,
  };
}

function usuarioCreado(cambios = {}) {
  return {
    id: 15,
    nombre: 'Lucía',
    apellido: 'Gómez',
    documento: '45678901',
    email: 'lucia@tumo.world',
    rol: 'tutor',
    estado: 'activo',
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
    usuarioRepository.buscarIdsPorCodigo.mockResolvedValue({ id_rol: 4, id_estado: 1 });
    usuarioRepository.crear.mockResolvedValue(usuarioCreado());
  });

  test('crea el usuario activo con el rol indicado y lo devuelve', async () => {
    const usuario = await crearUsuarioPorAdmin(datosAlta());

    expect(usuarioRepository.buscarIdsPorCodigo).toHaveBeenCalledWith('tutor', 'activo');
    expect(usuarioRepository.crear).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre: 'Lucía',
        email: 'lucia@tumo.world',
        idRol: 4,
        idEstado: 1,
      }),
    );
    expect(usuario).toEqual(usuarioCreado());
  });

  test('guarda la contraseña con hash argon2, nunca en texto plano (RNF07)', async () => {
    await crearUsuarioPorAdmin(datosAlta());

    const guardado = usuarioRepository.crear.mock.calls[0][0];
    expect(guardado).not.toHaveProperty('password');
    expect(JSON.stringify(guardado)).not.toContain('Inicial12345');
    expect(guardado.passwordHash).toMatch(/^\$argon2/);
    await expect(argon2.verify(guardado.passwordHash, 'Inicial12345')).resolves.toBe(true);
  });

  test('no envía código de verificación por mail (la cuenta ya queda activa)', async () => {
    await crearUsuarioPorAdmin(datosAlta());

    expect(mailService.enviarCodigoVerificacion).not.toHaveBeenCalled();
  });

  test('con un email ya registrado responde 409 EMAIL_DUPLICADO', async () => {
    usuarioRepository.crear.mockRejectedValue(errorDuplicado('uk_usuario_email'));

    await expect(crearUsuarioPorAdmin(datosAlta())).rejects.toMatchObject({
      statusCode: 409,
      code: 'EMAIL_DUPLICADO',
    });
  });

  test('con un documento ya registrado responde 409 DOCUMENTO_DUPLICADO', async () => {
    usuarioRepository.crear.mockRejectedValue(errorDuplicado('uk_usuario_documento'));

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
    expect(usuarioRepository.crear).not.toHaveBeenCalled();
  });

  test('si falta el estado "activo" en la base responde 500 de configuración', async () => {
    usuarioRepository.buscarIdsPorCodigo.mockResolvedValue({ id_rol: 4, id_estado: null });

    await expect(crearUsuarioPorAdmin(datosAlta())).rejects.toMatchObject({
      statusCode: 500,
      code: 'CONFIGURACION_USUARIO_INCOMPLETA',
    });
  });

  test('propaga los errores inesperados de la base', async () => {
    usuarioRepository.crear.mockRejectedValue(new Error('conexión perdida'));

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
    await editarUsuarioPorAdmin(15, { rol: 'alumno', email: 'otra@tumo.world' }, admin);

    expect(usuarioRepository.buscarIdsPorCodigo).toHaveBeenCalledWith('alumno', 'activo');
    expect(usuarioRepository.actualizar).toHaveBeenCalledWith(15, {
      email: 'otra@tumo.world',
      idRol: 2,
    });
  });

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
      editarUsuarioPorAdmin(15, { documento: '12345678' }, admin),
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
