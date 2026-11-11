const Joi = require('joi');
const { DOMINIOS_EMAIL_PERMITIDOS } = require('../../../config/dominios-mail');

const emailSchema = Joi.string()
  .trim()
  .lowercase()
  .email()
  .max(255)
  .custom((email, helpers) => {
    const dominioPermitido = DOMINIOS_EMAIL_PERMITIDOS.some((dominio) =>
      email.endsWith(dominio),
    );

    if (!dominioPermitido) {
      return helpers.error('string.emailDomain');
    }

    return email;
  })
  .messages({
    'string.emailDomain':
      'El email debe pertenecer a uno de los dominios permitidos',
  });

module.exports = { emailSchema };