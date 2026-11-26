
const express = require('express');
const { autenticar } = require('../middleware/auth.middleware');
const { requerirRol } = require('../middleware/rol.middleware');
const grupoController = require('../controllers/grupo.controller');
const { ROLES_TRABAJADORES } = require('../utils/roles');

const router = express.Router();

router.get('/', autenticar, grupoController.listarGrupos);
router.get(
  '/usuarios-disponibles',
  autenticar,
  requerirRol(...ROLES_TRABAJADORES),
  grupoController.listarUsuariosDisponibles,
);
router.get('/:id', autenticar, grupoController.obtenerGrupo);
router.post('/', autenticar, requerirRol(...ROLES_TRABAJADORES), grupoController.crearGrupo);
router.put('/:id', autenticar, requerirRol(...ROLES_TRABAJADORES), grupoController.editarGrupo);
router.delete('/:id', autenticar, requerirRol(...ROLES_TRABAJADORES), grupoController.borrarGrupo);

module.exports = router;

