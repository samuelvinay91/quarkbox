import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ApiKey } from '../src/api-key/api-key.entity';
import { ApiKeyService } from '../src/api-key/api-key.service';
import { User } from '../src/user/user.entity';

describe('ApiKeyService', () => {
  let app: INestApplication;
  let apiKeyService: ApiKeyService;
  let userRepo: Repository<User>;
  let userId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [ApiKey, User],
          synchronize: true,
          logging: false,
        }),
        TypeOrmModule.forFeature([ApiKey, User]),
      ],
      providers: [ApiKeyService],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    apiKeyService = app.get(ApiKeyService);
    userRepo = app.get(getRepositoryToken(User));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    const user = await userRepo.save(
      userRepo.create({
        email: `user-${Math.random().toString(36).slice(2)}@example.com`,
        passwordHash: 'irrelevant-for-this-test',
        isActive: true,
      }),
    );
    userId = user.id;
  });

  it('returns the raw key once, but only ever persists a hash and prefix', async () => {
    const { key, keyPrefix, id } = await apiKeyService.generate(userId, 'test-key');

    expect(key).toMatch(/^qkb_[0-9a-f]{64}$/);
    expect(keyPrefix).toBe(key.slice(0, 8));

    const apiKeyRepo = app.get<Repository<ApiKey>>(getRepositoryToken(ApiKey));
    const row = await apiKeyRepo.findOne({ where: { id } });
    expect(row).toBeDefined();
    expect(row!.keyHash).not.toBe(key);
    expect(row!.keyHash).toHaveLength(64); // sha256 hex digest
    expect((row as any).key).toBeUndefined(); // no raw-key column exists at all
  });

  it('validates a freshly generated key and rejects a tampered one', async () => {
    const { key } = await apiKeyService.generate(userId, 'test-key');

    const user = await apiKeyService.validate(key);
    expect(user?.id).toBe(userId);

    const tampered = key.slice(0, -1) + (key.endsWith('0') ? '1' : '0');
    expect(await apiKeyService.validate(tampered)).toBeNull();
  });

  it('rejects an expired key even if the hash matches', async () => {
    const { key, id } = await apiKeyService.generate(userId, 'expiring-key');
    const apiKeyRepo = app.get<Repository<ApiKey>>(getRepositoryToken(ApiKey));
    await apiKeyRepo.update(id, { expiresAt: new Date(Date.now() - 1000) });

    expect(await apiKeyService.validate(key)).toBeNull();
  });

  it('rejects a key belonging to a deactivated user', async () => {
    const { key } = await apiKeyService.generate(userId, 'deactivated-user-key');
    await userRepo.update(userId, { isActive: false });

    expect(await apiKeyService.validate(key)).toBeNull();
  });

  it('lists a user\'s keys without ever exposing the hash', async () => {
    await apiKeyService.generate(userId, 'key-a');
    await apiKeyService.generate(userId, 'key-b');

    const listed = await apiKeyService.listByUser(userId);
    expect(listed).toHaveLength(2);
    for (const row of listed) {
      expect((row as any).keyHash).toBeUndefined();
    }
  });

  it('lets an owner revoke their own key', async () => {
    const { id } = await apiKeyService.generate(userId, 'revoke-me');
    await apiKeyService.revoke(id, userId);
    expect(await apiKeyService.listByUser(userId)).toHaveLength(0);
  });

  it('refuses to revoke a key owned by a different user', async () => {
    const { id } = await apiKeyService.generate(userId, 'not-yours');
    await expect(apiKeyService.revoke(id, 'someone-else')).rejects.toThrow(ForbiddenException);
    expect(await apiKeyService.listByUser(userId)).toHaveLength(1);
  });

  it('throws 404 revoking a key that does not exist', async () => {
    await expect(apiKeyService.revoke('00000000-0000-0000-0000-000000000000', userId)).rejects.toThrow(
      NotFoundException,
    );
  });
});
