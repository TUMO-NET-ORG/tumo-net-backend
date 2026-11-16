const express = require('express');
const {
  crearUsuario,
  crearUsuarioAdmin,
} = require('../controllers/usuario.controller');
const { autenticar } = require('../middleware/auth.middleware');
const { requerirRol } = require('../middleware/rol.middleware');

const router = express.Router();

// Autorregistro público (CU05 / RF6).
router.post('/alta', crearUsuario);

// CU01 (RF1): alta individual por el administrador (RNF12).
router.post('/', autenticar, requerirRol('administrador'), crearUsuarioAdmin);

module.exports = router;
