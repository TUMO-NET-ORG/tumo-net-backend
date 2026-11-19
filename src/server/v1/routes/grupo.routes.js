
const express = require('express');
const { autenticar } = require('../middleware/auth.middleware');
const { requerirRol } = require('../middleware/rol.middleware');
const grupoController = require('../controllers/grupo.controller');

const router = express.Router();

router.get('/', autenticar, grupoController.listarGrupos);
router.get('/:id', autenticar, grupoController.obtenerGrupo);
router.post('/', autenticar, requerirRol('administrador', 'staff', 'tutor'), grupoController.crearGrupo);
router.put('/:id', autenticar, requerirRol('administrador', 'staff', 'tutor'), grupoController.editarGrupo);
router.delete('/:id', autenticar, requerirRol('administrador', 'staff', 'tutor'), grupoController.borrarGrupo);

module.exports = router;

