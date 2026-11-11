const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  login,
  logout,
  obtenerSesion,
  verificarEmail,
  reenviarVerificacion,
  solicitarRecuperacion,
  restablecerPassword,
} = require('../controllers/auth.controller');
const { autenticar } = require('../middleware/auth.middleware');

const router = express.Router();

function crearLimitador(limit, mensaje) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'DEMASIADAS_SOLICITUDES', mensaje },
  });
}

// Complementa el bloqueo por cuenta (5 intentos) frenando a una misma IP
// que prueba muchas cuentas distintas.
const loginLimiter = crearLimitador(
  20,
  'Demasiados intentos de inicio de sesión. Intentá nuevamente más tarde.',
);
const recoveryRequestLimiter = crearLimitador(
  5,
  'Demasiadas solicitudes. Intentá nuevamente más tarde.',
);
const recoveryResetLimiter = crearLimitador(
  10,
  'Demasiados intentos. Intentá nuevamente más tarde.',
);
const reenvioLimiter = crearLimitador(
  5,
  'Demasiadas solicitudes. Intentá nuevamente más tarde.',
);
const verificacionLimiter = crearLimitador(
  10,
  'Demasiados intentos. Intentá nuevamente más tarde.',
);

router.post('/login', loginLimiter, login);
router.post('/logout', autenticar, logout);
router.get('/me', autenticar, obtenerSesion);
router.post('/verify-email', verificacionLimiter, verificarEmail);
router.post('/resend-verification', reenvioLimiter, reenviarVerificacion);
router.post('/forgot-password', recoveryRequestLimiter, solicitarRecuperacion);
router.post('/reset-password', recoveryResetLimiter, restablecerPassword);

module.exports = router;
