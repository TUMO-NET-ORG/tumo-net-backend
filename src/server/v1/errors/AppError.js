class AppError extends Error {
  // extra: datos adicionales que se agregan a la respuesta (por ejemplo { grupos }).
  constructor(statusCode, message, code, extra = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.extra = extra;
  }
}

module.exports = AppError;
