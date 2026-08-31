import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Sandbox, SandboxStatus } from '../sandbox/sandbox.entity';
import { SandboxService } from '../sandbox/sandbox.service';
import { ActivityService } from '../activity/activity.service';
import { ActivityType } from '../activity/activity.entity';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class HibernationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HibernationService.name);
  private checkInterval?: NodeJS.Timeout;

  constructor(
    @InjectRepository(Sandbox)
    private readonly sandboxRepo: Repository<Sandbox>,
    @Inject(SandboxService)
    private readonly sandboxService: SandboxService,
    @Inject(ActivityService)
    private readonly activityService: ActivityService,
    private readonly config?: ConfigService,
  ) {}

  onModuleInit(): void {
    const defaultTimeoutSec =
      this.config?.get<number>('SANDBOX_IDLE_TIMEOUT') ||
      Number(process.env.SANDBOX_IDLE_TIMEOUT) ||
      1800;
    this.logger.log(
      `🛡️ Starting Resource Governor & Auto-Hibernation Engine (Idle timeout: ${defaultTimeoutSec}s)...`,
    );

    // Run idle check every 60 seconds
    this.checkInterval = setInterval(() => {
      this.reapIdleSandboxes().catch((err) =>
        this.logger.warn(`Auto-hibernation check failed: ${err.message}`),
      );
    }, 60000);
  }

  onModuleDestroy(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }

  /**
   * Scan for running sandboxes that have exceeded their inactivity threshold
   */
  async reapIdleSandboxes(): Promise<number> {
    const idleTimeoutSec =
      this.config?.get<number>('SANDBOX_IDLE_TIMEOUT') ||
      Number(process.env.SANDBOX_IDLE_TIMEOUT) ||
      1800;
    const cutoffDate = new Date(Date.now() - idleTimeoutSec * 1000);

    const idleSandboxes = await this.sandboxRepo.find({
      where: {
        status: SandboxStatus.RUNNING,
        lastActiveAt: LessThan(cutoffDate),
      },
    });

    if (idleSandboxes.length === 0) {
      return 0;
    }

    this.logger.log(
      `Found ${idleSandboxes.length} idle sandboxes to auto-hibernate...`,
    );

    for (const sandbox of idleSandboxes) {
      try {
        await this.sandboxService.pause(sandbox.id);
        await this.activityService.record({
          type: ActivityType.SANDBOX_PAUSED,
          summary: `Auto-hibernated idle sandbox "${sandbox.name}" (inactive for ${Math.round(idleTimeoutSec / 60)}m)`,
          sandboxId: sandbox.id,
          source: 'governor',
          metadata: { autoHibernated: true },
        });
        this.logger.log(`💤 Auto-hibernated sandbox ${sandbox.name} (${sandbox.id})`);
      } catch (err: any) {
        this.logger.warn(
          `Could not auto-hibernate sandbox ${sandbox.id}: ${err.message}`,
        );
      }
    }

    return idleSandboxes.length;
  }
}
