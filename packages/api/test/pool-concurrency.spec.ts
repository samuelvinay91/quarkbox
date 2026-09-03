import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Sandbox } from '../src/sandbox/sandbox.entity';
import { SandboxService } from '../src/sandbox/sandbox.service';
import { PoolService } from '../src/pool/pool.service';
import { MockRuntimeProvider } from '../src/runtime/mock.provider';

/**
 * Exercises the same regression scenarios as e2e.spec.ts's pool tests
 * (2b/2c), but constructs SandboxService/PoolService directly instead of
 * importing SandboxModule — SandboxModule transitively imports
 * ActivityModule, whose ActivityController currently fails to resolve
 * RetentionService (a pre-existing, unrelated module-wiring gap — see the
 * plan's Context section — that also breaks NestFactory.create(AppModule)
 * in the real app, not just tests). This file gives an independent,
 * currently-runnable proof that PoolService/SandboxService's own logic is
 * correct, decoupled from that unrelated bug.
 */
describe('Pool-claim correctness (module-graph-independent)', () => {
  let app: INestApplication;
  let sandboxRepo: Repository<Sandbox>;
  let poolService: PoolService;
  let sandboxService: SandboxService;

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

    const mockRuntime = new MockRuntimeProvider();
    poolService = new PoolService(mockRuntime, sandboxRepo, undefined);

    const stubActivityService = { record: async () => undefined } as any;
    const stubWebhookService = { dispatch: () => undefined } as any;
    const stubQuotaService = {
      validateResourceLimits: (_plan: unknown, cpu?: number, mem?: string, disk?: string) => ({
        cpuLimit: cpu ?? 1,
        memoryLimit: mem ?? '512m',
        diskLimit: disk ?? '10g',
      }),
      incrementDailyUsage: async () => undefined,
    } as any;

    sandboxService = new SandboxService(
      sandboxRepo,
      mockRuntime as any, // DockerProvider slot — getRuntime() dispatches by string, not instanceof
      mockRuntime as any, // FirecrackerProvider slot
      mockRuntime as any, // ContainerdProvider slot
      stubActivityService,
      poolService,
      stubWebhookService,
      stubQuotaService,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    // Each test seeds/drains a pool it owns for a distinct image, but reset
    // between tests anyway so pool state from one doesn't skew another.
    await sandboxRepo.clear();
  });

  it('keeps replenishing after every warm container has been claimed', async () => {
    await poolService.replenish();
    const before = (await poolService.getPoolStatus()).find((p) => p.image === 'python:3.12-slim')!;
    expect(before.warm).toBe(before.target);

    for (let i = 0; i < before.warm; i++) {
      const sandbox = await sandboxService.create({ name: `drain-${i}`, image: 'python:3.12-slim' } as any);
      expect(sandbox.containerId).toBeDefined();
    }

    // Pre-fix, replenish() re-counts the (still-labeled, now-adopted)
    // containers it just handed out as "still warm" and never tops the
    // pool back up.
    await poolService.replenish();
    const after = (await poolService.getPoolStatus()).find((p) => p.image === 'python:3.12-slim')!;
    expect(after.warm).toBe(before.target);
  });

  it('lets two concurrent creates race for one warm container without either failing', async () => {
    await poolService.replenish();
    let status = (await poolService.getPoolStatus()).find((p) => p.image === 'node:20-alpine')!;
    while (status.warm > 1) {
      await sandboxService.create({ name: `drain-${status.warm}`, image: 'node:20-alpine' } as any);
      status = (await poolService.getPoolStatus()).find((p) => p.image === 'node:20-alpine')!;
    }
    expect(status.warm).toBe(1);

    const [a, b] = await Promise.all([
      sandboxService.create({ name: 'racer-a', image: 'node:20-alpine' } as any),
      sandboxService.create({ name: 'racer-b', image: 'node:20-alpine' } as any),
    ]);

    expect(a.containerId).toBeDefined();
    expect(b.containerId).toBeDefined();
    expect(a.containerId).not.toBe(b.containerId);

    const rows = await sandboxRepo.find();
    const containerIds = rows.map((r) => r.containerId).filter(Boolean);
    expect(new Set(containerIds).size).toBe(containerIds.length); // no duplicates
  });
});
