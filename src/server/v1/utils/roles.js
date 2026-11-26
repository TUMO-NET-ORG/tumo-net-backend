// Jerarquía de roles (RNF12), de mayor a menor. Deben coincidir con la tabla `roles`.
// Un usuario solo puede operar sobre usuarios con un rol igual o inferior al suyo,
// y solo puede asignar roles iguales o inferiores al suyo.
const ROLES = ['superadmin', 'administrador', 'staff', 'tutor', 'alumno'];

// Trabajadores: todos menos el alumno. Pueden ver el listado de usuarios y gestionarlos.
const ROLES_TRABAJADORES = ROLES.filter((rol) => rol !== 'alumno');

// Pueden editar los datos y restablecer la contraseña de otros trabajadores.
// (Al resto de los trabajadores solo se les permite hacerlo con alumnos.)
const ROLES_ADMINISTRADORES = ['superadmin', 'administrador'];

// true si `rol` está al mismo nivel o por debajo de `tope`.
function rolIgualOInferior(rol, tope) {
  const posicionRol = ROLES.indexOf(rol);
  const posicionTope = ROLES.indexOf(tope);
  if (posicionRol === -1 || posicionTope === -1) return false;
  return posicionRol >= posicionTope;
}

module.exports = {
  ROLES,
  ROLES_TRABAJADORES,
  ROLES_ADMINISTRADORES,
  rolIgualOInferior,
};
