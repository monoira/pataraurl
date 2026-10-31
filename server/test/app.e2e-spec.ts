import {
  ClassSerializerInterceptor,
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User } from '../src/users/entities/user.entity.js';
import { Shorten } from '../src/shorten/entities/shorten.entity.js';
import cookieParser from 'cookie-parser';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module.js';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  const email = `e2e-${randomUUID()}@example.com`;
  const password = 'e2e-test-password';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );
    app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
    app.use(cookieParser());
    await app.init();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer()).get('/health').expect(200).expect({ status: 'ok' });
  });

  it('registers, authenticates, and manages a short URL in order', async () => {
    const http = request(app.getHttpServer());

    await http
      .post('/v1/users')
      .send({ name: 'E2E User', email: 'not-an-email', password })
      .expect(400);

    const registration = await http
      .post('/v1/users')
      .send({ name: 'E2E User', email, password })
      .expect(201);

    expect(registration.body).toMatchObject({ name: 'E2E User', email });
    expect(registration.body).not.toHaveProperty('password');
    await http.post('/v1/users').send({ name: 'Duplicate', email, password }).expect(409);

    await http.get('/v1/users/me').expect(401);
    await http.post('/v1/shorten').send({ url: 'https://example.com' }).expect(401);

    const login = await http.post('/v1/auth/login').send({ email, password }).expect(200);
    expect(login.body).toHaveProperty('access_token');

    const loginToken = login.body.access_token;
    if (typeof loginToken !== 'string') {
      throw new Error('Login response did not contain an access token');
    }

    const loginCookie = login.headers['set-cookie']?.[0]?.split(';', 1)[0];
    if (!loginCookie) {
      throw new Error('Login response did not contain a refresh cookie');
    }

    const profile = await http
      .get('/v1/users/me')
      .set('Authorization', `Bearer ${loginToken}`)
      .expect(200);
    expect(profile.body).toMatchObject({ name: 'E2E User', email });
    expect(profile.body).not.toHaveProperty('password');

    const refresh = await http.post('/v1/auth/refresh').set('Cookie', loginCookie).expect(200);
    const accessToken = refresh.body.access_token;
    if (typeof accessToken !== 'string') {
      throw new Error('Refresh response did not contain an access token');
    }

    const authorization = { Authorization: `Bearer ${accessToken}` };
    const refreshCookie = refresh.headers['set-cookie']?.[0]?.split(';', 1)[0];
    if (!refreshCookie) {
      throw new Error('Refresh response did not contain a refresh cookie');
    }

    const invalidShorten = await http
      .post('/v1/shorten')
      .set(authorization)
      .send({ url: 'not-a-url' })
      .expect(400);
    expect(invalidShorten.body).toHaveProperty('message');

    const created = await http
      .post('/v1/shorten')
      .set(authorization)
      .send({ url: 'https://example.com/original', nickname: 'E2E link' })
      .expect(201);
    expect(created.body).toMatchObject({
      url: 'https://example.com/original',
      nickname: 'E2E link',
    });
    expect(created.body.shortCode).toMatch(/^[a-zA-Z0-9]{6}$/);

    const shortCode = created.body.shortCode;
    if (typeof shortCode !== 'string') {
      throw new Error('Short URL response did not contain a short code');
    }

    const statsUrl = `/v1/shorten/${shortCode}/stats`;

    await http
      .get(statsUrl)
      .set(authorization)
      .expect(200)
      .expect(({ body }) => {
        expect(body.accessCount).toBe(0);
      });

    const original = await http.get(`/v1/shorten/${shortCode}`).expect(200);
    expect(original.body.url).toBe('https://example.com/original');

    const stats = await http.get(statsUrl).set(authorization).expect(200);
    expect(stats.body.accessCount).toBe(1);

    const allStats = await http.get('/v1/shorten/all-stats').set(authorization).expect(200);
    expect(allStats.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ shortCode, accessCount: 1 })]),
    );

    await http
      .put(`/v1/shorten/${shortCode}`)
      .set(authorization)
      .send({ url: 'https://example.org/updated', nickname: 'Updated link' })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          url: 'https://example.org/updated',
          nickname: 'Updated link',
        });
      });

    await http
      .get(`/v1/shorten/${shortCode}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.url).toBe('https://example.org/updated');
      });

    await http.delete(`/v1/shorten/${shortCode}`).set(authorization).expect(204);
    await http.get(`/v1/shorten/${shortCode}`).expect(404);

    await http.post('/v1/auth/logout').set(authorization).expect(200).expect({
      message: 'Logged out',
    });
    await http.post('/v1/auth/refresh').set('Cookie', refreshCookie).expect(401);
  });

  afterAll(async () => {
    if (!app) {
      return;
    }

    try {
      const dataSource = app.get(DataSource);
      const users = dataSource.getRepository(User);
      const user = await users.findOneBy({ email });

      if (user) {
        await dataSource.getRepository(Shorten).delete({ userId: user.id });
        await users.delete({ id: user.id });
      }
    } finally {
      await app.close();
    }
  });
});
