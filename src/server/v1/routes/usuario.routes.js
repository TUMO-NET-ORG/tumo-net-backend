const express = require('express');
const {
  crearUsuario,
  crearUsuarioAdmin,
  editarUsuarioAdmin,
  listarUsuariosAdmin,
  cambiarEstadoAdmin,
} = require('../controllers/usuario.controller');
const { autenticar } = require('../middleware/auth.middleware');
const { requerirRol } = require('../middleware/rol.middleware');

const router = express.Router();

// Autorregistro público (CU05 / RF6).
router.post('/alta', crearUsuario);

// CU01 (flujo principal, paso 2): listado para el administrador (RNF12).
router.get('/', autenticar, requerirRol('administrador'), listarUsuariosAdmin);

// CU01 (RF1): alta individual por el administrador (RNF12).
router.post('/', autenticar, requerirRol('administrador'), crearUsuarioAdmin);

// CU01 (RF1): edición de datos por el administrador (RNF12).
router.patch(
  '/:id',
  autenticar,
  requerirRol('administrador'),
  editarUsuarioAdmin,
);

// CU01 (flujo 3.b, RF2): cambio de estado y baja lógica (RNF12).
router.patch(
  '/:id/estado',
  autenticar,
  requerirRol('administrador'),
  cambiarEstadoAdmin,
);

module.exports = router;
