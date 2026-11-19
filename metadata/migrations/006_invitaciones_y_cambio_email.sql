-- Tokens de invitación administrativa y cambio de email.
ALTER TABLE token_recuperacion
  ADD COLUMN tipo varchar(30) NOT NULL DEFAULT 'recuperacion',
  ADD COLUMN email_pendiente varchar(255) NULL,
  ADD INDEX idx_token_accion_usuario_tipo (usuario_id, tipo, usado);
