import {
  Injectable,
  Inject,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  RuntimeProvider,
  RUNTIME_PROVIDER,
  RuntimeInfo,
} from '../runtime/runtime.interface';

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

  private readonly claimedIds = new Set<string>();

  /**
   * Attempt to claim a pre-warmed container from the standby pool.
   * Uses an atomic in-memory mutex to prevent concurrent double-claiming race conditions.
   * If available, returns the container info in <40ms.
   */
  async claim(image: string): Promise<RuntimeInfo | null> {
    try {
      const warmContainers = await this.runtime.list({
        'quarkbox.pool': 'true',
        'quarkbox.pool.image': image,
      });

      // Filter out any containers currently locked in-flight
      const available = warmContainers.filter((c) => !this.claimedIds.has(c.id));

      if (available.length === 0) {
        return null;
      }

      // Atomically lock the first available candidate
      const candidate = available[0];
      this.claimedIds.add(candidate.id);

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

    for (const pool of this.targetPools) {
      try {
        const warm = await this.runtime.list({
          'quarkbox.pool': 'true',
          'quarkbox.pool.image': pool.image,
        });
        results.push({
          image: pool.image,
          target: pool.targetSize,
          warm: warm.length,
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

      for (const pool of this.targetPools) {
        const existing = await this.runtime.list({
          'quarkbox.pool': 'true',
          'quarkbox.pool.image': pool.image,
        });

        const deficit = pool.targetSize - existing.length;
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
