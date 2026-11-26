const {
  ROLES,
  ROLES_TRABAJADORES,
  ROLES_ADMINISTRADORES,
  rolIgualOInferior,
} = require('../../src/server/v1/utils/roles');

describe('jerarquía de roles (RNF12)', () => {
  test('el orden es superadmin > administrador > staff > tutor > alumno', () => {
    expect(ROLES).toEqual(['superadmin', 'administrador', 'staff', 'tutor', 'alumno']);
  });

  test('los trabajadores son todos menos el alumno', () => {
    expect(ROLES_TRABAJADORES).toEqual(['superadmin', 'administrador', 'staff', 'tutor']);
  });

  test('los administradores son superadmin y administrador', () => {
    expect(ROLES_ADMINISTRADORES).toEqual(['superadmin', 'administrador']);
  });

  test.each([
    ['alumno', 'tutor', true],
    ['tutor', 'tutor', true],
    ['staff', 'tutor', false],
    ['administrador', 'administrador', true],
    ['superadmin', 'administrador', false],
    ['superadmin', 'superadmin', true],
    ['alumno', 'superadmin', true],
  ])('%s es igual o inferior a %s: %s', (rol, tope, esperado) => {
    expect(rolIgualOInferior(rol, tope)).toBe(esperado);
  });

  test('con un rol desconocido devuelve false', () => {
    expect(rolIgualOInferior('invitado', 'superadmin')).toBe(false);
    expect(rolIgualOInferior('alumno', 'invitado')).toBe(false);
  });
});
