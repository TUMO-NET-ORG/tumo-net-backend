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

const router = express.Router();

// Autorregistro público (CU05 / RF6).
router.post('/alta', crearUsuario);

// CU01 (flujo principal, paso 2): listado para el administrador (RNF12).
router.get('/', autenticar, requerirRol('administrador'), listarUsuariosAdmin);

router.get('/catalogos', autenticar, requerirRol('administrador'), listarCatalogosAdmin);

// CU01 (RF1): alta individual por el administrador (RNF12).
router.post('/', autenticar, requerirRol('administrador'), crearUsuarioAdmin);

// Consulta individual para la pantalla de edición del administrador.
router.get('/:id', autenticar, requerirRol('administrador'), obtenerUsuarioAdmin);

// CU01 (RF1): edición de datos por el administrador (RNF12).
router.patch(
  '/:id',
  autenticar,
  requerirRol('administrador'),
  editarUsuarioAdmin,
);

router.post(
  '/:id/cambio-email',
  autenticar,
  requerirRol('administrador'),
  solicitarCambioEmailAdmin,
);

// CU01 (flujo 3.b, RF2): cambio de estado y baja lógica (RNF12).
router.patch(
  '/:id/estado',
  autenticar,
  requerirRol('administrador'),
  cambiarEstadoAdmin,
);

// CU01 (flujo 3.a, RF4): contraseña temporal generada por el sistema (RNF12).
router.post(
  '/:id/restablecer-password',
  autenticar,
  requerirRol('administrador'),
  restablecerPasswordAdmin,
);

module.exports = router;
