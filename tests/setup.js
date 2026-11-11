// Variables mínimas para que la app funcione en los tests, sin depender
// del .env local ni de una base de datos real.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'secreto-de-pruebas';
process.env.JWT_EXPIRES_IN = '1h';
process.env.CORS_ORIGIN = 'http://localhost:5173';
