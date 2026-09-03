import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

import { SandboxModule } from '../src/sandbox/sandbox.module';
import { SandboxService } from '../src/sandbox/sandbox.service';
import { Sandbox, SandboxStatus } from '../src/sandbox/sandbox.entity';
import { PoolModule } from '../src/pool/pool.module';
import { PoolService } from '../src/pool/pool.service';
import { SnapshotModule } from '../src/snapshot/snapshot.module';
import { SnapshotService } from '../src/snapshot/snapshot.service';
import { Snapshot } from '../src/snapshot/snapshot.entity';
import { Cluster } from '../src/cluster/cluster.entity';
import { Activity } from '../src/activity/activity.entity';
import { MarketplaceTemplate } from '../src/template/template.entity';
import { Plan } from '../src/plan/plan.entity';
import { PlanModule } from '../src/plan/plan.module';
import { GovernorModule } from '../src/governor/governor.module';
import { HibernationService } from '../src/governor/hibernation.service';
import { ContextModule } from '../src/context/context.module';
import { ContextService } from '../src/context/context.service';
import { DevcontainerModule } from '../src/devcontainer/devcontainer.module';
import { DevcontainerService } from '../src/devcontainer/devcontainer.service';
import { ActivityModule } from '../src/activity/activity.module';
import { ActivityService } from '../src/activity/activity.service';
import { ProxyModule } from '../src/proxy/proxy.module';
import { ProxyService } from '../src/proxy/proxy.service';
import { TemplateModule } from '../src/template/template.module';
import { TemplateController } from '../src/template/template.controller';
import { RUNTIME_PROVIDER } from '../src/runtime/runtime.interface';
import { MockRuntimeProvider } from '../src/runtime/mock.provider';
import { DockerProvider } from '../src/runtime/docker.provider';

describe('QuarkBox Enterprise E2E Test Suite', () => {
  let app: INestApplication;
  let sandboxService: SandboxService;
  let poolService: PoolService;
  let snapshotService: SnapshotService;
  let hibernationService: HibernationService;
  let contextService: ContextService;
  let devcontainerService: DevcontainerService;
  let activityService: ActivityService;
  let proxyService: ProxyService;
  let templateController: TemplateController;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              NODE_ENV: 'test',
              SANDBOX_IDLE_TIMEOUT: 60,
              ENABLE_WARM_POOL: 'true',
            }),
          ],
        }),
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [Sandbox, Snapshot, Activity, MarketplaceTemplate, Cluster, Plan],
          synchronize: true,
          logging: false,
        }),
        ActivityModule,
        PoolModule,
        SandboxModule,
        SnapshotModule,
        GovernorModule,
        ContextModule,
        DevcontainerModule,
        ProxyModule,
        TemplateModule,
        PlanModule,
      ],
    })
      .overrideProvider(RUNTIME_PROVIDER)
      .useClass(MockRuntimeProvider)
      .overrideProvider(DockerProvider)
      .useClass(MockRuntimeProvider)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    sandboxService = app.get(SandboxService);
    poolService = app.get(PoolService);
    snapshotService = app.get(SnapshotService);
    hibernationService = app.get(HibernationService);
    contextService = app.get(ContextService);
    devcontainerService = app.get(DevcontainerService);
    activityService = app.get(ActivityService);
    proxyService = app.get(ProxyService);
    templateController = app.get(TemplateController);
  });

  afterAll(async () => {
    await app.close();
  });

  // ── 1. Starter Templates ──────────────────────────────────────────

  it('1. should list all pre-configured starter templates', async () => {
    const templates = await templateController.listTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(4);
    expect(templates.map((t) => t.slug)).toContain('langgraph-agent-harness');
    expect(templates.map((t) => t.slug)).toContain('nextjs15-fullstack-dev');
  });

  // ── 2. Pre-warmed Pool Engine (<50ms startup) ────────────────────

  it('2. should manage warm standby pool and execute fast claim', async () => {
    await poolService.replenish();
    const status = await poolService.getPoolStatus();
    expect(status.length).toBeGreaterThan(0);

    const ubuntuPool = status.find((p) => p.image === 'ubuntu:22.04');
    expect(ubuntuPool).toBeDefined();
    expect(ubuntuPool!.warm).toBeGreaterThan(0);

    // Fast claim
    const start = Date.now();
    const claimed = await poolService.claim('ubuntu:22.04');
    const elapsed = Date.now() - start;

    expect(claimed).not.toBeNull();
    expect(elapsed).toBeLessThan(100); // Sub-100ms claim
  });

  it('2b. should keep replenishing after every warm container has been claimed (regression)', async () => {
    await poolService.replenish();
    const before = (await poolService.getPoolStatus()).find(
      (p) => p.image === 'python:3.12-slim',
    );
    expect(before).toBeDefined();
    const target = before!.target;

    // Exhaust every warm container currently reported for this image —
    // each claimed container keeps its `quarkbox.pool=true` label forever
    // (labels are immutable post-creation), so a naive "count containers
    // with this label" replenishment check would see the pool as still
    // full and never top it back up.
    for (let i = 0; i < before!.warm; i++) {
      const sandbox = await sandboxService.create({
        name: `pool-drain-${i}`,
        image: 'python:3.12-slim',
      });
      expect(sandbox.containerId).toBeDefined();
    }

    await poolService.replenish();
    const after = (await poolService.getPoolStatus()).find(
      (p) => p.image === 'python:3.12-slim',
    );
    expect(after!.warm).toBe(target);
  });

  it('2c. should let two concurrent creates race for one warm container without either failing (regression)', async () => {
    // Seed exactly one warm node:20-alpine container.
    await poolService.replenish();
    let status = (await poolService.getPoolStatus()).find(
      (p) => p.image === 'node:20-alpine',
    );
    expect(status!.warm).toBeGreaterThan(0);

    // Claim down to exactly one remaining warm container for this image.
    while (status!.warm > 1) {
      await sandboxService.create({ name: `drain-${status!.warm}`, image: 'node:20-alpine' });
      status = (await poolService.getPoolStatus()).find((p) => p.image === 'node:20-alpine');
    }
    expect(status!.warm).toBe(1);

    const [a, b] = await Promise.all([
      sandboxService.create({ name: 'racer-a', image: 'node:20-alpine' }),
      sandboxService.create({ name: 'racer-b', image: 'node:20-alpine' }),
    ]);

    // Neither request should have failed, and no two sandboxes should ever
    // share a containerId — the `sandboxes.containerId` unique constraint,
    // combined with SandboxService.create()'s catch-and-cold-provision
    // fallback, is what guarantees this under real concurrency (this test
    // proves the code path is logically correct; MockRuntimeProvider is
    // synchronous/in-memory, so it doesn't itself exercise real DB-level
    // race timing).
    expect(a.containerId).toBeDefined();
    expect(b.containerId).toBeDefined();
    expect(a.containerId).not.toBe(b.containerId);
  });

  // ── 3. Sandbox Lifecycle State Machine ────────────────────────────

  it('3. should handle complete sandbox lifecycle (create -> exec -> pause -> resume -> stop)', async () => {
    const sandbox = await sandboxService.create({
      name: 'test-agent-sandbox',
      image: 'python:3.12-slim',
      cpuLimit: 2,
      memoryLimit: '1g',
    });

    expect(sandbox.id).toBeDefined();
    expect(sandbox.status).toBe(SandboxStatus.RUNNING);
    expect(sandbox.containerIp).toBeDefined();

    // Exec command
    const execRes = await sandboxService.exec(
      sandbox.id,
      'echo "Agent code execution ready"',
    );
    expect(execRes.exitCode).toBe(0);
    expect(execRes.stdout).toContain('Agent code execution ready');

    // Pause & Resume
    const paused = await sandboxService.pause(sandbox.id);
    expect(paused.status).toBe(SandboxStatus.PAUSED);

    const resumed = await sandboxService.resume(sandbox.id);
    expect(resumed.status).toBe(SandboxStatus.RUNNING);

    // Stop
    const stopped = await sandboxService.stop(sandbox.id);
    expect(stopped.status).toBe(SandboxStatus.STOPPED);
  });

  // ── 4. Snapshot & 1-Click Fork Engine ─────────────────────────────

  it('4. should create snapshots and fork running sandboxes', async () => {
    const sandbox = await sandboxService.create({
      name: 'parent-sandbox',
      image: 'ubuntu:22.04',
    });

    // Create snapshot
    const snapshot = await snapshotService.createSnapshot({
      sandboxId: sandbox.id,
      name: 'checkpoint-v1',
      description: 'Training iteration 1',
    });

    expect(snapshot.id).toBeDefined();
    expect(snapshot.status).toBe('ready');
    expect(snapshot.snapshotImage).toContain('quarkbox-snap');

    // 1-Click Fork
    const forkSnap = await snapshotService.forkSandbox(
      sandbox.id,
      'child-clone',
    );
    expect(forkSnap.id).toBeDefined();
    expect(forkSnap.name).toContain('Fork: child-clone');
  });

  // ── 5. Auto-Hibernation Governor ──────────────────────────────────

  it('5. should detect idle sandboxes and auto-hibernate them', async () => {
    const idleSandbox = await sandboxService.create({
      name: 'abandoned-sandbox',
      image: 'ubuntu:22.04',
    });

    // Simulate inactivity 2 hours ago
    idleSandbox.lastActiveAt = new Date(Date.now() - 7200 * 1000);
    const repo = app.get('SandboxRepository') as any;
    await repo.save(idleSandbox);

    const reapedCount = await hibernationService.reapIdleSandboxes();
    expect(reapedCount).toBeGreaterThanOrEqual(1);

    const refreshed = await sandboxService.findOne(idleSandbox.id);
    expect(refreshed.status).toBe(SandboxStatus.PAUSED);
  });

  // ── 6. AI Agent Context Layer ─────────────────────────────────────

  it('6. should inject Git repositories, secrets, and create-from-repo', async () => {
    const sandbox = await sandboxService.create({
      name: 'context-sandbox',
      image: 'ubuntu:22.04',
    });

    // Inject Git
    const gitRes = await contextService.injectGitRepo(sandbox.id, {
      repoUrl: 'https://github.com/quarkbox/starter-ml.git',
      branch: 'main',
    });
    expect(gitRes.exitCode).toBe(0);

    // Inject Secrets
    await contextService.injectSecrets(sandbox.id, {
      OPENAI_API_KEY: 'sk-test-mock-key',
      DATABASE_URL: 'postgres://user:pass@db:5432/test',
    });

    // 1-Click Create from repo
    const repoBox = await contextService.createFromRepo({
      name: 'fastapi-app',
      repoUrl: 'https://github.com/fastapi/fastapi.git',
      branch: 'master',
      envVars: { ENV: 'production' },
    });
    expect(repoBox.id).toBeDefined();
    expect(repoBox.status).toBe(SandboxStatus.RUNNING);
  });

  // ── 7. Devcontainer Specification Engine ──────────────────────────

  it('7. should parse devcontainer.json configuration', async () => {
    const jsonContent = `
    {
      "name": "Node.js & TypeScript",
      "image": "mcr.microsoft.com/devcontainers/typescript-node:20",
      "forwardPorts": [3000, 8080],
      "postCreateCommand": "npm install",
      "customizations": {
        "vscode": {
          "extensions": ["dbaeumer.vscode-eslint"]
        }
      }
    }
    `;

    const config = devcontainerService.parseConfig(jsonContent);
    expect(config.name).toBe('Node.js & TypeScript');
    expect(config.forwardPorts).toEqual([3000, 8080]);
    expect(config.postCreateCommand).toBe('npm install');
  });

  // ── 8. Proxy & Port Forwarding ────────────────────────────────────

  it('8. should generate preview URLs for sandbox ports', async () => {
    const sandbox = await sandboxService.create({
      name: 'web-service',
      image: 'node:20-alpine',
      ports: { '3000': '3000', '8080': '8080' },
    });

    const previewUrls = await proxyService.getPreviewUrls(sandbox.id);
    expect(previewUrls.length).toBeGreaterThanOrEqual(2);
    expect(previewUrls[0].url).toContain(`/api/proxy/${sandbox.id}/3000/`);
  });

  // ── 9. Activity Timeline & Statistics ─────────────────────────────

  it('9. should record all operations and provide audit stats', async () => {
    const feed = await activityService.getGlobalFeed(50);
    expect(feed.total).toBeGreaterThan(5);
    expect(feed.items[0].type).toBeDefined();

    const stats = await activityService.getStats();
    expect(stats.totalEvents).toBeGreaterThan(0);
    expect(stats.commandsExecuted).toBeGreaterThan(0);
  });
});
