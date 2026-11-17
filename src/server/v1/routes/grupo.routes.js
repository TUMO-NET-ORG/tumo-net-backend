
const express = require('express');
const { autenticar } = require('../middleware/auth.middleware');
const { requerirRol } = require('../middleware/rol.middleware');
const grupoController = require('../controllers/grupo.controller');

const router = express.Router();


router.post('/', autenticar, requerirRol('administrador', 'staff', 'tutor'), grupoController.crearGrupo);

module.exports = router;

