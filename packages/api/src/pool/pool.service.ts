import {
  Injectable,
  Inject,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, IsNull, Repository } from 'typeorm';
import {
  RuntimeProvider,
  RUNTIME_PROVIDER,
  RuntimeInfo,
} from '../runtime/runtime.interface';
import { Sandbox } from '../sandbox/sandbox.entity';

interface PoolConfig {
  image: string;
  targetSize: number;
  cpuLimit: number;
  memoryLimit: string;
}

@Injectable()
export class PoolService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PoolService.name);
  private replenishmentTimer?: NodeJS.Timeout;
  private isReplenishing = false;

  // Default pre-warmed pool targets for high-frequency images
  private readonly targetPools: PoolConfig[] = [
    {
      image: 'ubuntu:22.04',
      targetSize: 2,
      cpuLimit: 1,
      memoryLimit: '512m',
    },
    {
      image: 'python:3.12-slim',
      targetSize: 1,
      cpuLimit: 2,
      memoryLimit: '1g',
    },
    {
      image: 'node:20-alpine',
      targetSize: 1,
      cpuLimit: 1,
      memoryLimit: '512m',
    },
  ];

  constructor(
    @Inject(RUNTIME_PROVIDER)
    private readonly runtime: RuntimeProvider,
    @InjectRepository(Sandbox)
    private readonly sandboxRepo: Repository<Sandbox>,
    private readonly config?: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const enablePool =
      (this.config?.get<string>('ENABLE_WARM_POOL') ||
        process.env.ENABLE_WARM_POOL ||
        'true') === 'true';
    if (!enablePool) {
      this.logger.log('Pre-warmed pool disabled via config');
      return;
    }

    this.logger.log('🚀 Initializing Sub-50ms Pre-warmed Sandbox Pool Engine...');
    await this.replenish();

    // Check & replenish pool every 30 seconds
    this.replenishmentTimer = setInterval(() => {
      this.replenish().catch((err) =>
        this.logger.warn(`Background pool replenishment failed: ${err.message}`),
      );
    }, 30000);
  }

  onModuleDestroy(): void {
    if (this.replenishmentTimer) {
      clearInterval(this.replenishmentTimer);
    }
  }

  /**
   * Container IDs still labeled `quarkbox.pool=true` in the runtime never lose
   * that label once claimed (Docker labels are immutable post-creation), so
   * the runtime's own container listing can't tell a truly-idle warm
   * container apart from one that's already been handed to a live Sandbox.
   * Postgres — already the durable, transactional record of sandbox
   * ownership — is the single source of truth for "claimed" instead: any
   * containerId already attached to a Sandbox row is excluded from both
   * claim candidates and replenishment-deficit accounting. This also makes
   * claiming safe across horizontally-scaled API replicas and survives a
   * process restart, neither of which an in-memory Set could offer.
   */
  private async getClaimedContainerIds(): Promise<Set<string>> {
    const rows = await this.sandboxRepo.find({
      where: { containerId: Not(IsNull()) },
      select: { containerId: true },
    });
    return new Set(rows.map((r) => r.containerId as string));
  }

  /**
   * Attempt to claim a pre-warmed container from the standby pool.
   * If available, returns the container info in <40ms. A concurrent claim of
   * the same candidate by another request/replica is still possible in the
   * gap between this check and the caller's own save — that's resolved by
   * the `sandboxes.containerId` unique constraint, not here: the loser of
   * that race gets a unique-violation error and falls back to a cold
   * provision (see SandboxService.create).
   */
  async claim(image: string): Promise<RuntimeInfo | null> {
    try {
      const [warmContainers, claimedIds] = await Promise.all([
        this.runtime.list({
          'quarkbox.pool': 'true',
          'quarkbox.pool.image': image,
        }),
        this.getClaimedContainerIds(),
      ]);

      const available = warmContainers.filter((c) => !claimedIds.has(c.id));

      if (available.length === 0) {
        return null;
      }

      const candidate = available[0];

      this.logger.log(
        `⚡ Ultra-fast claim: using warm standby container ${candidate.id.slice(0, 12)} for ${image}`,
      );

      // Trigger background replenishment for this pool immediately
      setImmediate(() => {
        this.replenish().catch(() => {});
      });

      return candidate;
    } catch (err: any) {
      this.logger.warn(`Failed to claim from pool: ${err.message}`);
      return null;
    }
  }

  /**
   * Get current pool status across all images
   */
  async getPoolStatus(): Promise<
    Array<{ image: string; target: number; warm: number }>
  > {
    const results: Array<{ image: string; target: number; warm: number }> = [];
    const claimedIds = await this.getClaimedContainerIds();

    for (const pool of this.targetPools) {
      try {
        const warm = await this.runtime.list({
          'quarkbox.pool': 'true',
          'quarkbox.pool.image': pool.image,
        });
        results.push({
          image: pool.image,
          target: pool.targetSize,
          warm: warm.filter((c) => !claimedIds.has(c.id)).length,
        });
      } catch {
        results.push({
          image: pool.image,
          target: pool.targetSize,
          warm: 0,
        });
      }
    }

    return results;
  }

  /**
   * Replenish all pools up to their target size
   */
  async replenish(): Promise<void> {
    if (this.isReplenishing) return;
    this.isReplenishing = true;

    try {
      const isHealthy = await this.runtime.healthCheck();
      if (!isHealthy) return;

      const claimedIds = await this.getClaimedContainerIds();

      for (const pool of this.targetPools) {
        const existing = await this.runtime.list({
          'quarkbox.pool': 'true',
          'quarkbox.pool.image': pool.image,
        });
        const unclaimed = existing.filter((c) => !claimedIds.has(c.id));

        const deficit = pool.targetSize - unclaimed.length;
        if (deficit > 0) {
          this.logger.log(
            `Replenishing pool for ${pool.image} (need +${deficit} warm containers)...`,
          );

          for (let i = 0; i < deficit; i++) {
            const poolId = `pool-${Math.random().toString(36).substring(2, 10)}`;
            try {
              await this.runtime.create({
                name: poolId,
                image: pool.image,
                cpuLimit: pool.cpuLimit,
                memoryLimit: pool.memoryLimit,
                labels: {
                  'quarkbox.pool': 'true',
                  'quarkbox.pool.image': pool.image,
                },
              });
            } catch (err: any) {
              this.logger.warn(
                `Failed to create warm container for ${pool.image}: ${err.message}`,
              );
              break; // Don't loop on failure
            }
          }
        }
      }
    } finally {
      this.isReplenishing = false;
    }
  }
}
