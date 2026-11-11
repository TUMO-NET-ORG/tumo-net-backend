// Límites por IP y middleware de roles. Va en un archivo aparte porque
// Jest aísla los módulos por archivo: así los contadores de rate limit
// empiezan en cero y no interfieren con las demás pruebas.
jest.mock('../../src/server/v1/repositories/auth.repository');
jest.mock('../../src/server/v1/services/mail.service');

const express = require('express');
const request = require('supertest');
const app = require('../../src/app');
const authRepository = require('../../src/server/v1/repositories/auth.repository');
const { requerirRol } = require('../../src/server/v1/middleware/rol.middleware');

describe('rate limit por IP', () => {
  test('/login responde 429 después de 20 intentos en 15 minutos', async () => {
    authRepository.buscarPorEmail.mockResolvedValue(undefined);
    const intentar = () =>
      request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'x@tumo.world', password: 'cualquiera' });

    for (let i = 0; i < 20; i += 1) {
      const res = await intentar();
      expect(res.status).toBe(401);
    }

    const bloqueada = await intentar();
    expect(bloqueada.status).toBe(429);
    expect(bloqueada.body.error).toBe('DEMASIADAS_SOLICITUDES');
  });

  test('/forgot-password responde 429 después de 5 pedidos', async () => {
    authRepository.buscarPorEmail.mockResolvedValue(undefined);
    const pedir = () =>
      request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'x@tumo.world' });

    for (let i = 0; i < 5; i += 1) {
      expect((await pedir()).status).toBe(202);
    }
    expect((await pedir()).status).toBe(429);
  });
});

describe('requerirRol (RF8)', () => {
  function appConRol(rolUsuario) {
    const prueba = express();
    prueba.get(
      '/admin',
      (req, res, next) => {
        req.usuario = rolUsuario ? { rol: rolUsuario } : undefined;
        next();
      },
      requerirRol('administrador'),
      (req, res) => res.json({ ok: true }),
    );
    prueba.use((error, req, res, next) =>
      res.status(error.statusCode).json({ error: error.code }),
    );
    return prueba;
  }

  test('permite el acceso al rol autorizado', async () => {
    const res = await request(appConRol('administrador')).get('/admin');
    expect(res.status).toBe(200);
  });

  test('403 para un rol no autorizado', async () => {
    const res = await request(appConRol('alumno')).get('/admin');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('SIN_PERMISO');
  });

  test('401 si no hay sesión', async () => {
    const res = await request(appConRol(null)).get('/admin');
    expect(res.status).toBe(401);
  });
});
