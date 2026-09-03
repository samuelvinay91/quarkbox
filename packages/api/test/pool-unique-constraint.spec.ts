import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Sandbox, SandboxStatus, SandboxRuntime } from '../src/sandbox/sandbox.entity';
import { isUniqueConstraintViolation } from '../src/common/db-errors.util';

/**
 * Proves the `sandboxes.containerId` unique index (added alongside the
 * PoolService fix that stops trusting an in-memory Set as the source of
 * truth for "already claimed") is actually enforced by the database, not
 * just assumed. Runs against the same better-sqlite3 + synchronize:true
 * harness the rest of the suite uses, so it's a genuine end-to-end proof —
 * sqlite honors the entity-level @Index(unique: true) via synchronize the
 * same way it will in dev/local use.
 */
describe('Sandbox.containerId unique constraint', () => {
  let app: INestApplication;
  let sandboxRepo: Repository<Sandbox>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [Sandbox],
          synchronize: true,
          logging: false,
        }),
        TypeOrmModule.forFeature([Sandbox]),
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    sandboxRepo = app.get(getRepositoryToken(Sandbox));
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows multiple sandboxes with a null containerId', async () => {
    const a = await sandboxRepo.save(
      sandboxRepo.create({
        name: 'no-container-a',
        status: SandboxStatus.CREATING,
        runtime: SandboxRuntime.DOCKER,
      }),
    );
    const b = await sandboxRepo.save(
      sandboxRepo.create({
        name: 'no-container-b',
        status: SandboxStatus.CREATING,
        runtime: SandboxRuntime.DOCKER,
      }),
    );

    expect(a.id).not.toBe(b.id);
  });

  it('rejects a second sandbox saved with a containerId already in use', async () => {
    await sandboxRepo.save(
      sandboxRepo.create({
        name: 'holder',
        status: SandboxStatus.RUNNING,
        runtime: SandboxRuntime.DOCKER,
        containerId: 'dup-container-id',
      }),
    );

    let caught: unknown;
    try {
      await sandboxRepo.save(
        sandboxRepo.create({
          name: 'contender',
          status: SandboxStatus.RUNNING,
          runtime: SandboxRuntime.DOCKER,
          containerId: 'dup-container-id',
        }),
      );
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect(isUniqueConstraintViolation(caught)).toBe(true);
  });
});
