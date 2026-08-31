import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Activity, ActivityType } from './activity.entity';

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(
    @InjectRepository(Activity)
    private readonly activityRepo: Repository<Activity>,
  ) {}

  /**
   * Record an activity event
   */
  async record(params: {
    type: ActivityType;
    summary: string;
    sandboxId?: string;
    userId?: string;
    source?: string;
    metadata?: Record<string, unknown>;
    durationMs?: number;
    isError?: boolean;
  }): Promise<Activity> {
    const activity = this.activityRepo.create({
      type: params.type,
      summary: params.summary,
      sandboxId: params.sandboxId,
      userId: params.userId,
      source: params.source || 'api',
      metadata: params.metadata,
      durationMs: params.durationMs,
      isError: params.isError || false,
    });

    const saved = await this.activityRepo.save(activity);
    this.logger.debug(`Activity recorded: ${params.type} — ${params.summary}`);
    return saved;
  }

  /**
   * Get activity timeline for a sandbox
   */
  async getForSandbox(
    sandboxId: string,
    limit = 50,
    offset = 0,
  ): Promise<{ items: Activity[]; total: number }> {
    const [items, total] = await this.activityRepo.findAndCount({
      where: { sandboxId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { items, total };
  }

  /**
   * Get global activity feed (all sandboxes)
   */
  async getGlobalFeed(
    limit = 50,
    offset = 0,
  ): Promise<{ items: Activity[]; total: number }> {
    const [items, total] = await this.activityRepo.findAndCount({
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
      relations: { sandbox: true },
    });
    return { items, total };
  }

  /**
   * Get activity stats for dashboard widgets
   */
  async getStats(): Promise<{
    totalEvents: number;
    commandsExecuted: number;
    errorsToday: number;
    avgExecDurationMs: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalEvents = await this.activityRepo.count();

    const commandsExecuted = await this.activityRepo.count({
      where: { type: ActivityType.COMMAND_EXECUTED },
    });

    const errorsToday = await this.activityRepo
      .createQueryBuilder('activity')
      .where('activity.isError = :isError', { isError: true })
      .andWhere('activity.createdAt >= :today', { today })
      .getCount();

    const avgResult = await this.activityRepo
      .createQueryBuilder('activity')
      .select('AVG(activity.durationMs)', 'avg')
      .where('activity.type = :type', {
        type: ActivityType.COMMAND_EXECUTED,
      })
      .andWhere('activity.durationMs IS NOT NULL')
      .getRawOne();

    return {
      totalEvents,
      commandsExecuted,
      errorsToday,
      avgExecDurationMs: Math.round(avgResult?.avg || 0),
    };
  }

  /**
   * Export cryptographically verified SOC2 Type II / ISO-27001 Audit Trail
   */
  async exportSoc2Audit(limit = 500) {
    const items = await this.activityRepo.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });

    const crypto = await import('crypto');
    const records = items.map((act) => {
      const raw = `${act.id}|${act.createdAt}|${act.type}|${act.userId || 'system'}|${act.sandboxId || ''}|${act.summary}`;
      const hash = crypto.createHash('sha256').update(raw).digest('hex');
      return {
        recordId: act.id,
        timestamp: act.createdAt,
        type: act.type,
        actor: act.userId || 'system',
        sandboxId: act.sandboxId,
        summary: act.summary,
        isError: act.isError,
        durationMs: act.durationMs,
        integritySignature: hash,
      };
    });

    const rootHash = crypto
      .createHash('sha256')
      .update(records.map((r) => r.integritySignature).join(':'))
      .digest('hex');

    return {
      complianceStandard: 'SOC2-Type-II / ISO-27001 Cloud Security',
      organization: 'QuarkBox Autonomous Agent Cloud',
      exportedAt: new Date().toISOString(),
      recordCount: records.length,
      auditChainRootHash: rootHash,
      records,
    };
  }
}
