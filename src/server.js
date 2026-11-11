// src/server.js
require('dotenv').config({ quiet: true });
const app = require('./app');

const PUERTO = process.env.PORT || 3000;
app.listen(PUERTO, () => console.log(`API escuchando en el puerto ${PUERTO}`));