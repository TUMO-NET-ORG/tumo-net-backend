const express = require('express');
const { crearUsuario } = require('../controllers/usuario.controller');

const router = express.Router();

router.post('/alta', crearUsuario);

module.exports = router;
