// Duración del enlace de invitación que recibe una cuenta creada por un trabajador
// (CU01). Es larga porque la persona puede tardar en ver el mail; si vence, la
// pide de nuevo desde "Olvidé mi contraseña".
const DURACION_INVITACION_HORAS = Number(process.env.INVITACION_EXPIRES_HOURS || 48);

function vencimientoInvitacion() {
  return new Date(Date.now() + DURACION_INVITACION_HORAS * 60 * 60 * 1000);
}

module.exports = { DURACION_INVITACION_HORAS, vencimientoInvitacion };
