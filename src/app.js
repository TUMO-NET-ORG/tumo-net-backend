 

require('dotenv').config({ quiet: true });
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const usuarioRoutes = require('./server/v1/routes/usuario.routes');
const authRoutes = require('./server/v1/routes/auth.routes');
const grupoRoutes = require('./server/v1/routes/grupo.routes');
const publicacionRoutes = require('./server/v1/routes/publicacion.routes');
const AppError = require('./server/v1/errors/AppError');

const app = express();


const origenesPermitidos = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origen) => origen.trim());

app.use(cors({
  origin: origenesPermitidos,
}));


app.use(helmet({
  referrerPolicy: { policy: 'no-referrer' },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(express.json());
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.get('/api/health', (req, res) => res.json({ estado: 'ok' }));
app.use('/api/v1/usuarios', usuarioRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/grupos', grupoRoutes);
app.use('/api/v1/publicaciones', publicacionRoutes);




app.use((req, res) => {
  res.status(404).json({ error: 'RUTA_NO_ENCONTRADA' });
});

app.use((error, req, res, next) => {
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      error: 'IMAGEN_DEMASIADO_GRANDE',
      mensaje: 'Cada imagen debe pesar menos de 5 MB',
    });
  }
  if (error.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({
      error: 'DEMASIADAS_IMAGENES',
      mensaje: 'Se permiten hasta 10 imágenes por publicación',
    });
  }
  if (error.message === 'SOLO_IMAGENES') {
    return res.status(400).json({
      error: 'SOLO_IMAGENES',
      mensaje: 'Solo se permiten archivos JPG, PNG, WebP o GIF',
    });
  }
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      ...error.extra,
      error: error.code,
      mensaje: error.message,
    });
  }

  console.error('Error no controlado:', error);
  return res.status(500).json({ error: 'ERROR_INTERNO' });
});


module.exports = app;
