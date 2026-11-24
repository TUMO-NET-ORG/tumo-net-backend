// src/server.js
require('dotenv').config({ quiet: true });
const app = require('./app');

const PUERTO = process.env.PORT || 3000;
const servidor = app.listen(PUERTO, () =>
  console.log(`API escuchando en el puerto ${PUERTO}`),
);

servidor.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `No se pudo iniciar: el puerto ${PUERTO} ya está ocupado por otro proceso.`,
    );
  } else {
    console.error('No se pudo iniciar el servidor:', error.message);
  }
  process.exit(1);
});