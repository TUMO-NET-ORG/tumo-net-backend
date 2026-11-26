const express = require('express');
const {
  crearUsuario,
  crearUsuarioAdmin,
  obtenerUsuarioAdmin,
  editarUsuarioAdmin,
  solicitarCambioEmailAdmin,
  listarUsuariosAdmin,
  cambiarEstadoAdmin,
  restablecerPasswordAdmin,
  listarCatalogosAdmin,
} = require('../controllers/usuario.controller');
const { autenticar } = require('../middleware/auth.middleware');
const { requerirRol } = require('../middleware/rol.middleware');
const { ROLES_TRABAJADORES } = require('../utils/roles');

const router = express.Router();

// Autorregistro público (CU05 / RF6). Siempre crea alumnos.
router.post('/alta', crearUsuario);

// Todas las rutas de gestión están abiertas a los trabajadores (RNF12). El servicio
// controla la jerarquía: solo se opera sobre usuarios con un rol igual o inferior
// al propio, y los datos y la contraseña de un trabajador solo los cambia un
// administrador o superadmin.

// CU01 (flujo principal, paso 2): listado para el administrador (RNF12).
router.get('/', autenticar, requerirRol(...ROLES_TRABAJADORES), listarUsuariosAdmin);

router.get('/catalogos', autenticar, requerirRol(...ROLES_TRABAJADORES), listarCatalogosAdmin);

// CU01 (RF1): alta individual por el administrador (RNF12).
router.post('/', autenticar, requerirRol(...ROLES_TRABAJADORES), crearUsuarioAdmin);

// Consulta individual para la pantalla de edición del administrador.
router.get('/:id', autenticar, requerirRol(...ROLES_TRABAJADORES), obtenerUsuarioAdmin);

// CU01 (RF1): edición de datos por el administrador (RNF12).
router.patch(
  '/:id',
  autenticar,
  requerirRol(...ROLES_TRABAJADORES),
  editarUsuarioAdmin,
);

router.post(
  '/:id/cambio-email',
  autenticar,
  requerirRol(...ROLES_TRABAJADORES),
  solicitarCambioEmailAdmin,
);

// CU01 (flujo 3.b, RF2): cambio de estado y baja lógica (RNF12).
router.patch(
  '/:id/estado',
  autenticar,
  requerirRol(...ROLES_TRABAJADORES),
  cambiarEstadoAdmin,
);

// CU01 (flujo 3.a, RF4): contraseña temporal generada por el sistema (RNF12).
router.post(
  '/:id/restablecer-password',
  autenticar,
  requerirRol(...ROLES_TRABAJADORES),
  restablecerPasswordAdmin,
);

module.exports = router;
