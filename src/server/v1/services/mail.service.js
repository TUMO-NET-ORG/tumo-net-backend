const nodemailer = require('nodemailer');
const AppError = require('../errors/AppError');

let transporter;

function obtenerTransporter() {
  if (transporter) {
    return transporter;
  }

  const requiredConfig = [
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASSWORD',
    'SMTP_FROM',
  ];
  const missingConfig = requiredConfig.filter(
    (variable) => !process.env[variable],
  );

  if (missingConfig.length > 0) {

    throw new AppError(
      500,
      'La configuración SMTP está incompleta',
      'CONFIGURACION_SMTP_INCOMPLETA',
    );
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  return transporter;
}

async function enviarCodigoVerificacion(email, codigo) {
  try {
    await obtenerTransporter().sendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: 'Verificá tu cuenta TUMO',
      text: [
        'Tu código de verificación es:',
        '',
        codigo,
        '',
        'El código vence en 15 minutos.',
      ].join('\n'),
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    console.error('Error enviando email de verificación:', error.message);
    throw new AppError(
      502,
      'No se pudo enviar el email de verificación',
      'EMAIL_VERIFICACION_NO_ENVIADO',
    );
  }
}

async function enviarEnlaceRecuperacion(email, token) {
  try {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const duracionToken = process.env.RECOVERY_TOKEN_EXPIRES_MINUTES || 15;
    const enlace = `${frontendUrl}/recuperar-contrasena#token=${encodeURIComponent(token)}`;
    const textoPlano = [
      'Solicitaste recuperar tu contraseña de TUMO.',
      '',
      'Abrí el botón "Restablecer contraseña" de este email para elegir una nueva contraseña.',
      '',
      `El botón vence en ${duracionToken} minutos y solo puede utilizarse una vez.`,
      '',
      'Si tu cliente de correo no muestra botones, abrí este email en un cliente compatible con HTML.',
    ].join('\n');
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1f2937">
        <h2>Recuperá tu contraseña</h2>
        <p>Solicitaste restablecer la contraseña de tu cuenta TUMO.</p>
        <p>
          <a
            href="${enlace}"
            style="display:inline-block;padding:12px 20px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px"
          >
            Restablecer contraseña
          </a>
        </p>
        <p>El botón vence en ${duracionToken} minutos y solo puede utilizarse una vez.</p>
        <p>Si no solicitaste este cambio, podés ignorar este email.</p>
      </div>
    `;

    await obtenerTransporter().sendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: 'Recuperá tu contraseña de TUMO',
      text: textoPlano,
      html,
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    console.error('Error enviando enlace de recuperación:', error.message);
    throw new AppError(
      502,
      'No se pudo enviar el enlace de recuperación',
      'ENLACE_RECUPERACION_NO_ENVIADO',
    );
  }
}

module.exports = { enviarCodigoVerificacion, enviarEnlaceRecuperacion };
