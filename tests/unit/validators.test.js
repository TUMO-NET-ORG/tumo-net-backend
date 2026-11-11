const { emailSchema } = require('../../src/server/v1/validators/email.validator');
const {
  loginSchema,
  restablecerPasswordSchema,
} = require('../../src/server/v1/validators/auth.validator');
const { altaUsuarioSchema } = require('../../src/server/v1/validators/usuario.validator');

describe('email.validator (RF6: dominio de TUMO)', () => {
  test('acepta un correo @tumo.world y lo normaliza', () => {
    const { error, value } = emailSchema.validate('  Ana.Perez@TUMO.world ');
    expect(error).toBeUndefined();
    expect(value).toBe('ana.perez@tumo.world');
  });

  test('rechaza un dominio que no está en la lista', () => {
    const { error } = emailSchema.validate('ana@hotmail.com');
    expect(error.details[0].type).toBe('string.emailDomain');
    expect(error.message).toBe(
      'El email debe pertenecer a uno de los dominios permitidos',
    );
  });

  test('rechaza un dominio que solo contiene el de TUMO como prefijo', () => {
    const { error } = emailSchema.validate('ana@tumo.world.evil.com');
    expect(error).toBeDefined();
  });

  test('rechaza texto que no es un email', () => {
    expect(emailSchema.validate('no-es-email').error).toBeDefined();
  });
});

describe('política de contraseña (RNF07: mínimo 10 caracteres)', () => {
  const token = 'a'.repeat(64);

  test.each([
    ['corta1', 'menos de 10 caracteres'],
    ['abcdefghij', 'sin números'],
  ])('rechaza "%s" (%s)', (nuevaPassword) => {
    const { error } = restablecerPasswordSchema.validate({ token, nuevaPassword });
    expect(error.message).toMatch(/al menos 10 caracteres y un número/);
  });

  test('acepta una contraseña de 10 caracteres con número', () => {
    const { error } = restablecerPasswordSchema.validate({
      token,
      nuevaPassword: 'abcdefghi1',
    });
    expect(error).toBeUndefined();
  });

  test('el alta de usuario aplica la misma política', () => {
    const { error } = altaUsuarioSchema.validate({
      nombre: 'Ana',
      apellido: 'Pérez',
      documento: '12345678',
      email: 'ana@tumo.world',
      password: 'corta1',
      aceptaTerminos: true,
      versionTerminos: '1.0',
    });
    expect(error.details[0].path).toEqual(['password']);
  });
});

describe('loginSchema', () => {
  test('exige email y contraseña', () => {
    const { error } = loginSchema.validate({}, { abortEarly: false });
    expect(error.details.map((d) => d.path[0]).sort()).toEqual([
      'email',
      'password',
    ]);
  });
});
