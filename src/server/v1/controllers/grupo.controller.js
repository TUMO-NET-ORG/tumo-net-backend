const { crearGrupoSchema } = require('../validators/grupo.validator');
const { crearGrupo: crearGrupoService } = require('../services/grupo.service');
const { responderDatosInvalidos } = require('../utils/respuesta');

async function crearGrupo(req, res) {
  const validacion = crearGrupoSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true, //ignora campos inesperados
  });

  if (validacion.error) {
    return responderDatosInvalidos(res, validacion.error);
  }
  const grupo = await crearGrupoService(validacion.value, req.usuario.id);
  return res.status(201).json({ grupo });
}

module.exports = { crearGrupo };
