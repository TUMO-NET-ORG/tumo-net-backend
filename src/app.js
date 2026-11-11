 

require('dotenv').config({ quiet: true });
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const usuarioRoutes = require('./server/v1/routes/usuario.routes');
const authRoutes = require('./server/v1/routes/auth.routes');
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
}));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ estado: 'ok' }));
app.use('/api/v1/usuarios', usuarioRoutes);
app.use('/api/v1/auth', authRoutes);


app.use((req, res) => {
  res.status(404).json({ error: 'RUTA_NO_ENCONTRADA' });
});

app.use((error, req, res, next) => {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: error.code,
      mensaje: error.message,
    });
  }

  console.error('Error no controlado:', error);
  return res.status(500).json({ error: 'ERROR_INTERNO' });
});


module.exports = app;