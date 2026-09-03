import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not } from 'typeorm';
import { Sandbox } from '../sandbox/sandbox.entity';
import { Cluster } from '../cluster/cluster.entity';
import { Plan } from './plan.entity';
import { User } from '../user/user.entity';

export interface PlanCheckResult {
  allowed: boolean;
  reason?: string;
  limits: Plan;
  usage: {
    activeSandboxes: number;
    dailySandboxesUsed: number;
    activeClusters: number;
  };
}

@Injectable()
export class QuotaService {
  constructor(
    @InjectRepository(Sandbox)
    private readonly sandboxRepo: Repository<Sandbox>,
    @InjectRepository(Plan)
    private readonly planRepo: Repository<Plan>,
    @InjectRepository(Cluster)
    private readonly clusterRepo: Repository<Cluster>,
  ) {}

  async getPlanForUser(user: User): Promise<Plan> {
    const planName = user.plan || 'free';
    const plan = await this.planRepo.findOne({ where: { name: planName } });
    if (plan) return plan;
    const fallback = await this.planRepo.findOne({ where: { name: 'free' } });
    if (fallback) return fallback;
    return this.planRepo.create({
      name: 'free',
      maxConcurrentSandboxes: 1,
      maxSandboxesPerDay: 10,
      maxCpuPerSandbox: 1,
      maxMemoryPerSandbox: '2g',
      maxClusters: 0,
      maxDiskPerSandbox: '5g',
      snapshotsEnabled: true,
    });
  }

  async getEmpiricalUsage(userId: string): Promise<{
    activeSandboxes: number;
    activeClusters: number;
  }> {
    const removed = In(['removed', 'deleted']);
    const [activeSandboxes, activeClusters] = await Promise.all([
      this.sandboxRepo.count({ where: { userId, status: Not(removed) } }),
      this.clusterRepo.count({ where: { userId, status: Not(removed) } }),
    ]);
    return { activeSandboxes, activeClusters };
  }

  /**
   * Gate a single sandbox creation. Cluster limits are checked separately
   * by checkClusterCreateAllowed() — this used to also block on
   * `activeClusters >= plan.maxClusters`, which meant every free-tier user
   * (maxClusters: 0) was blocked from creating even a single plain sandbox,
   * since that inequality (0 >= 0) is always true. Nothing ever called this
   * method from cluster creation, so the check never actually gated
   * clusters either — it just silently broke sandboxes for everyone.
   */
  async checkCreateAllowed(
    userId: string,
    plan: Plan,
  ): Promise<{ allowed: boolean; reason?: string }> {
    const { activeSandboxes } = await this.getEmpiricalUsage(userId);

    if (activeSandboxes >= plan.maxConcurrentSandboxes) {
      return {
        allowed: false,
        reason: `concurrent sandbox limit (${plan.maxConcurrentSandboxes}) reached`,
      };
    }

    const user = await this.sandboxRepo.manager.getRepository(User).findOne({
      where: { id: userId },
    });
    if (user && user.dailyCountDate === this.todayString()) {
      if (user.dailySandboxCount >= plan.maxSandboxesPerDay) {
        return {
          allowed: false,
          reason: `daily sandbox limit (${plan.maxSandboxesPerDay}) reached`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Gate creating a new cluster. Call this before provisioning anything —
   * in particular before inserting the Cluster row, since
   * getEmpiricalUsage()'s activeClusters count would otherwise include the
   * very cluster being created, blocking a user's first cluster on every
   * plan (including paid tiers) the moment its own row exists.
   */
  async checkClusterCreateAllowed(
    userId: string,
    plan: Plan,
  ): Promise<{ allowed: boolean; reason?: string }> {
    const { activeClusters } = await this.getEmpiricalUsage(userId);

    if (activeClusters >= plan.maxClusters) {
      return {
        allowed: false,
        reason: `cluster limit (${plan.maxClusters}) reached`,
      };
    }

    return { allowed: true };
  }

  async incrementDailyUsage(userId: string): Promise<void> {
    const userRepo = this.sandboxRepo.manager.getRepository(User);
    const user = await userRepo.findOne({ where: { id: userId } });
    if (!user) return;

    const today = this.todayString();
    if (user.dailyCountDate !== today) {
      user.dailyCountDate = today;
      user.dailySandboxCount = 1;
    } else {
      user.dailySandboxCount += 1;
    }
    await userRepo.save(user);
  }

  validateResourceLimits(
    plan: Plan | null,
    requestedCpu?: number,
    requestedMemory?: string,
    requestedDisk?: string,
  ): { cpuLimit: number; memoryLimit: string; diskLimit: string } {
    const limits = plan || this.fallbackFreePlan();
    const cpuLimit = requestedCpu
      ? Math.min(requestedCpu, limits.maxCpuPerSandbox)
      : limits.maxCpuPerSandbox;
    const memoryLimit = this.clampMemory(requestedMemory, limits.maxMemoryPerSandbox);
    const diskLimit = this.clampDisk(requestedDisk, limits.maxDiskPerSandbox);
    return { cpuLimit, memoryLimit, diskLimit };
  }

  private fallbackFreePlan(): Plan {
    return this.planRepo.create({
      name: 'free',
      maxConcurrentSandboxes: 1,
      maxSandboxesPerDay: 10,
      maxCpuPerSandbox: 1,
      maxMemoryPerSandbox: '2g',
      maxClusters: 0,
      maxDiskPerSandbox: '5g',
      snapshotsEnabled: true,
    });
  }

  async getPlanInfoForUser(userId: string, user: User): Promise<PlanCheckResult> {
    const plan = await this.getPlanForUser(user);
    const { activeSandboxes, activeClusters } = await this.getEmpiricalUsage(userId);
    const dailySandboxesUsed =
      user.dailyCountDate === this.todayString() ? user.dailySandboxCount : 0;
    return {
      allowed: true,
      limits: plan,
      usage: {
        activeSandboxes,
        dailySandboxesUsed,
        activeClusters,
      },
    };
  }

  async getSandboxRepoManager(): Promise<Repository<User>> {
    return this.sandboxRepo.manager.getRepository(User);
  }

  private todayString(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
  }

  private parseSize(size: string): number {
    const match = /^(\d+)([kmgt]?)$/i.exec(size.trim());
    if (!match) return 0;
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const mult: Record<string, number> = {
      k: 1024,
      m: 1024 * 1024,
      g: 1024 * 1024 * 1024,
      t: 1024 * 1024 * 1024 * 1024,
    };
    return value * (mult[unit] || 1);
  }

  private clampMemory(requested: string | undefined, max: string): string {
    const chosen = requested || max;
    if (this.parseSize(chosen) <= this.parseSize(max)) return chosen;
    return max;
  }

  private clampDisk(requested: string | undefined, max: string): string {
    const chosen = requested || max;
    if (this.parseSize(chosen) <= this.parseSize(max)) return chosen;
    return max;
  }
}
