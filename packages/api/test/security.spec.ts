import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';

import { AuthModule } from '../src/auth/auth.module';
import { UserModule } from '../src/user/user.module';
import { ApiKeyModule } from '../src/api-key/api-key.module';
import { SandboxModule } from '../src/sandbox/sandbox.module';
import { Sandbox } from '../src/sandbox/sandbox.entity';
import { Snapshot } from '../src/snapshot/snapshot.entity';
import { Activity } from '../src/activity/activity.entity';
import { MarketplaceTemplate } from '../src/template/template.entity';
import { Cluster } from '../src/cluster/cluster.entity';
import { User } from '../src/user/user.entity';
import { ApiKey } from '../src/api-key/api-key.entity';
import { Webhook } from '../src/webhook/webhook.entity';
import { Plan } from '../src/plan/plan.entity';
import { PlanModule } from '../src/plan/plan.module';
import { RevokedToken } from '../src/auth/revoked-token.entity';
import { RUNTIME_PROVIDER } from '../src/runtime/runtime.interface';
import { MockRuntimeProvider } from '../src/runtime/mock.provider';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';

const TEST_JWT_SECRET = 'test-secret-key-for-security-tests';

describe('Security Regression Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              NODE_ENV: 'test',
              JWT_SECRET: TEST_JWT_SECRET,
            }),
          ],
        }),
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [Sandbox, Snapshot, Activity, MarketplaceTemplate, Cluster, User, ApiKey, Webhook, Plan, RevokedToken],
          synchronize: true,
          logging: false,
        }),
        AuthModule,
        UserModule,
        ApiKeyModule,
        SandboxModule,
        PlanModule,
      ],
      providers: [
        {
          provide: APP_GUARD,
          useClass: JwtAuthGuard,
        },
      ],
    })
      .overrideProvider(RUNTIME_PROVIDER)
      .useClass(MockRuntimeProvider)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('JWT Strategy', () => {
    it('should throw when JWT_SECRET is not provided', () => {
      const mockConfigService = {
        get: vi.fn((key: string) => {
          if (key === 'JWT_SECRET') return undefined;
          return undefined;
        }),
      } as unknown as ConfigService;

      expect(() => new JwtStrategy(mockConfigService as any)).toThrow(
        'JWT_SECRET environment variable is required',
      );
    });

    it('should reject payload without sub claim', async () => {
      const mockConfigService = {
        get: vi.fn((key: string) => {
          if (key === 'JWT_SECRET') return TEST_JWT_SECRET;
          return undefined;
        }),
      } as unknown as ConfigService;

      const strategy = new JwtStrategy(mockConfigService as any);

      await expect(strategy.validate({ email: 'test@test.com' })).rejects.toThrow();
    });

    it('should accept valid payload with sub claim', async () => {
      const mockConfigService = {
        get: vi.fn((key: string) => {
          if (key === 'JWT_SECRET') return TEST_JWT_SECRET;
          return undefined;
        }),
      } as unknown as ConfigService;

      const strategy = new JwtStrategy(mockConfigService as any);

      const result = await strategy.validate({
        sub: 'user-id-123',
        email: 'test@test.com',
        name: 'Test User',
      });

      expect(result).toEqual({
        userId: 'user-id-123',
        email: 'test@test.com',
        name: 'Test User',
      });
    });
  });

  describe('Dev-token endpoint', () => {
    it('should return 404 when NODE_ENV is production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const response = await request(app.getHttpServer())
          .post('/auth/dev-token')
          .send({});

        expect(response.status).toBe(404);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('should return 200 when NODE_ENV is not production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      try {
        const response = await request(app.getHttpServer())
          .post('/auth/dev-token')
          .send({});

        expect(response.status).toBe(200);
        expect(response.body.token).toBeDefined();
        expect(response.body.expiresIn).toBe('24h');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe('API-key endpoint requires auth', () => {
    it('should return 401 when no token is provided', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/api-key')
        .send({});

      expect(response.status).toBe(401);
    });

    it('should return 401 with invalid token', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/api-key')
        .set('Authorization', 'Bearer invalid-token-here')
        .send({});

      expect(response.status).toBe(401);
    });
  });

  describe('API-key ownership & lifecycle', () => {
    async function registerAndGetToken(email: string): Promise<string> {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: 'longenoughpassword123' });
      return res.body.token;
    }

    it('generates a key without ever returning it again on list', async () => {
      const token = await registerAndGetToken(`apikey-owner-${Date.now()}@example.com`);

      const created = await request(app.getHttpServer())
        .post('/auth/api-key')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'ci-key' });

      expect(created.status).toBe(200);
      expect(created.body.key).toMatch(/^qkb_[0-9a-f]{64}$/);
      expect(created.body.keyPrefix).toBe(created.body.key.slice(0, 8));

      const listed = await request(app.getHttpServer())
        .get('/auth/api-key')
        .set('Authorization', `Bearer ${token}`);

      expect(listed.status).toBe(200);
      expect(listed.body).toHaveLength(1);
      expect(listed.body[0].id).toBe(created.body.id);
      expect(listed.body[0]).not.toHaveProperty('key');
      expect(listed.body[0]).not.toHaveProperty('keyHash');
    });

    it('refuses to let one user revoke another user\'s key', async () => {
      const ownerToken = await registerAndGetToken(`apikey-a-${Date.now()}@example.com`);
      const otherToken = await registerAndGetToken(`apikey-b-${Date.now()}@example.com`);

      const created = await request(app.getHttpServer())
        .post('/auth/api-key')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'owners-key' });

      const revokeAttempt = await request(app.getHttpServer())
        .delete(`/auth/api-key/${created.body.id}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(revokeAttempt.status).toBe(403);

      const stillListed = await request(app.getHttpServer())
        .get('/auth/api-key')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(stillListed.body).toHaveLength(1);
    });
  });

  describe('Auth bypass on sandboxes', () => {
    it('should return 401 when accessing /sandboxes without token', async () => {
      const response = await request(app.getHttpServer())
        .get('/sandboxes')
        .send();

      expect(response.status).toBe(401);
    });

    it('should return 401 when creating sandbox without token', async () => {
      const response = await request(app.getHttpServer())
        .post('/sandboxes')
        .send({ name: 'test', image: 'ubuntu:22.04' });

      expect(response.status).toBe(401);
    });

    it('should return 401 with malformed Bearer token', async () => {
      const response = await request(app.getHttpServer())
        .get('/sandboxes')
        .set('Authorization', 'Bearer not-a-real-jwt');

      expect(response.status).toBe(401);
    });
  });

  describe('Register endpoint validation', () => {
    it('should reject registration with invalid email', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'not-an-email', password: 'longenoughpassword' });

      expect(response.status).toBe(400);
    });

    it('should reject registration with short password', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'test@example.com', password: 'short' });

      expect(response.status).toBe(400);
    });
  });
});
