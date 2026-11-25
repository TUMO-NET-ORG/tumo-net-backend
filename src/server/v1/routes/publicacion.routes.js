const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { autenticar } = require('../middleware/auth.middleware');
const publicacionController = require('../controllers/publicacion.controller');

const carpetaUploads = path.join(process.cwd(), 'uploads', 'publicaciones');
fs.mkdirSync(carpetaUploads, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, next) => next(null, carpetaUploads),
  filename: (req, file, next) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const nombre = `${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`;
    next(null, nombre);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, next) => {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) {
      const error = new Error('SOLO_IMAGENES');
      error.statusCode = 400;
      return next(error);
    }
    next(null, true);
  },
});

const router = express.Router();

router.get('/disciplinas', autenticar, publicacionController.listarDisciplinas);
router.get('/', autenticar, publicacionController.listarPublicaciones);
router.post('/', autenticar, upload.array('imagenes', 10), publicacionController.crearPublicacion);

module.exports = router;
