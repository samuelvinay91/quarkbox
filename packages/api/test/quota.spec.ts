import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { QuotaService } from '../src/plan/quota.service';
import { Plan } from '../src/plan/plan.entity';
import { Sandbox } from '../src/sandbox/sandbox.entity';
import { Cluster } from '../src/cluster/cluster.entity';

function createMockRepo(overrides: Record<string, any> = {}) {
  return {
    findOne: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn((entity) => entity),
    save: vi.fn((entity) => Promise.resolve({ id: 'uuid-1', ...entity })),
    manager: {
      getRepository: vi.fn(() => ({
        findOne: vi.fn().mockResolvedValue(null),
        save: vi.fn().mockResolvedValue({}),
      })),
    },
    ...overrides,
  } as unknown as Repository<any>;
}

describe('QuotaService', () => {
  let quotaService: QuotaService;
  let sandboxRepo: ReturnType<typeof createMockRepo>;
  let clusterRepo: ReturnType<typeof createMockRepo>;
  let planRepo: ReturnType<typeof createMockRepo>;

  const freePlan: Plan = {
    id: 'plan-1',
    name: 'free',
    maxConcurrentSandboxes: 1,
    maxSandboxesPerDay: 10,
    maxCpuPerSandbox: 1,
    maxMemoryPerSandbox: '2g',
    maxDiskPerSandbox: '5g',
    maxClusters: 0,
    snapshotsEnabled: true,
  };

  const proPlan: Plan = {
    ...freePlan,
    name: 'pro',
    maxConcurrentSandboxes: 5,
    maxSandboxesPerDay: 25,
    maxCpuPerSandbox: 4,
    maxMemoryPerSandbox: '8g',
    maxDiskPerSandbox: '20g',
    maxClusters: 2,
  };

  beforeEach(async () => {
    sandboxRepo = createMockRepo({ count: vi.fn().mockResolvedValue(0) });
    clusterRepo = createMockRepo({ count: vi.fn().mockResolvedValue(0) });
    planRepo = createMockRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotaService,
        { provide: getRepositoryToken(Sandbox), useValue: sandboxRepo },
        { provide: getRepositoryToken(Plan), useValue: planRepo },
        { provide: getRepositoryToken(Cluster), useValue: clusterRepo },
      ],
    }).compile();

    quotaService = module.get(QuotaService);
  });

  describe('checkCreateAllowed', () => {
    it('should reject when concurrent sandbox limit is reached', async () => {
      sandboxRepo.count = vi.fn().mockResolvedValue(1);

      const result = await quotaService.checkCreateAllowed('user-1', freePlan);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('concurrent sandbox limit');
    });

    it('should allow a free-tier user (maxClusters: 0) to create a plain sandbox', async () => {
      // Regression test: this used to also check activeClusters >= plan.maxClusters,
      // which is always true for the free plan (0 >= 0) — meaning no free-tier
      // user could ever create a single sandbox. Sandbox creation must not be
      // gated on cluster capacity at all.
      sandboxRepo.count = vi.fn().mockResolvedValue(0);
      clusterRepo.count = vi.fn().mockResolvedValue(0);

      const result = await quotaService.checkCreateAllowed('user-1', freePlan);

      expect(result.allowed).toBe(true);
    });

    it('should allow when under the concurrent sandbox limit', async () => {
      sandboxRepo.count = vi.fn().mockResolvedValue(0);

      const result = await quotaService.checkCreateAllowed('user-1', proPlan);

      expect(result.allowed).toBe(true);
    });
  });

  describe('checkClusterCreateAllowed', () => {
    it('should reject when cluster limit is reached', async () => {
      // free plan allows 0 clusters -> always at limit
      clusterRepo.count = vi.fn().mockResolvedValue(0);

      const result = await quotaService.checkClusterCreateAllowed('user-1', freePlan);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('cluster limit');
    });

    it('should reject when cluster count meets pro maximum', async () => {
      clusterRepo.count = vi.fn().mockResolvedValue(2);

      const result = await quotaService.checkClusterCreateAllowed('user-1', proPlan);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('cluster limit');
    });

    it('should allow when under the cluster limit', async () => {
      clusterRepo.count = vi.fn().mockResolvedValue(1);

      const result = await quotaService.checkClusterCreateAllowed('user-1', proPlan);

      expect(result.allowed).toBe(true);
    });
  });

  describe('getEmpiricalUsage', () => {
    it('should return counts of active sandboxes and clusters', async () => {
      sandboxRepo.count = vi.fn().mockResolvedValue(3);
      clusterRepo.count = vi.fn().mockResolvedValue(1);

      const usage = await quotaService.getEmpiricalUsage('user-1');

      expect(usage).toEqual({ activeSandboxes: 3, activeClusters: 1 });
    });
  });

  describe('validateResourceLimits', () => {
    it('should clamp CPU to plan maximum', () => {
      const result = quotaService.validateResourceLimits(freePlan, 8);
      expect(result.cpuLimit).toBe(1);
    });

    it('should clamp memory to plan maximum', () => {
      const result = quotaService.validateResourceLimits(freePlan, 1, '8g');
      expect(result.memoryLimit).toBe('2g');
    });

    it('should clamp disk to plan maximum', () => {
      const result = quotaService.validateResourceLimits(freePlan, 1, '1g', '100g');
      expect(result.diskLimit).toBe('5g');
    });

    it('should use plan defaults when no values requested', () => {
      const result = quotaService.validateResourceLimits(freePlan);
      expect(result.cpuLimit).toBe(1);
      expect(result.memoryLimit).toBe('2g');
      expect(result.diskLimit).toBe('5g');
    });

    it('should allow values within plan limits', () => {
      const result = quotaService.validateResourceLimits(proPlan, 2, '4g', '10g');
      expect(result.cpuLimit).toBe(2);
      expect(result.memoryLimit).toBe('4g');
      expect(result.diskLimit).toBe('10g');
    });
  });
});
