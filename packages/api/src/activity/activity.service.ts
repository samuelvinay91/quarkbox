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

    // Compute HMAC-SHA256 chain: each record's integrity depends on the previous
    try {
      const hmacSecret = process.env.AUDIT_HMAC_SECRET || 'quarkbox-default-hmac-key-change-me';
      const previousRecord = await this.activityRepo.findOne({
        where: {},
        order: { createdAt: 'DESC' },
        select: { integrityHmac: true },
      });
      const previousHmac = previousRecord?.integrityHmac || '0'.repeat(64);

      const payload = `${previousHmac}|${saved.id}|${saved.createdAt}|${saved.type}|${saved.userId || 'system'}|${saved.sandboxId || ''}|${saved.summary}`;
      const crypto = await import('crypto');
      const hmac = crypto.createHmac('sha256', hmacSecret).update(payload).digest('hex');

      saved.integrityHmac = hmac;
      await this.activityRepo.update(saved.id, { integrityHmac: hmac });
    } catch (err: any) {
      this.logger.error(`Failed to compute audit HMAC: ${err.message}`);
    }

    this.logger.debug(`Activity recorded: ${params.type} — ${params.summary}`);

    // Persistent audit log export (append-only)
    try {
      const fs = require('fs/promises');
      const path = require('path');
      const auditLogPath = process.env.AUDIT_LOG_PATH || '/var/log/quarkbox/audit.ndjson';
      
      // Ensure directory exists
      await fs.mkdir(path.dirname(auditLogPath), { recursive: true });
      
      const logEntry = JSON.stringify({
        ...saved,
        _siem_timestamp: new Date().toISOString(),
        _integrity_hmac: saved.integrityHmac,
      }) + '\n';
      await fs.appendFile(auditLogPath, logEntry, { flag: 'a' });
    } catch (err: any) {
      this.logger.error(`Failed to export audit log: ${err.message}`);
    }

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
   * Get a user's audit trail with pagination
   */
  async getAuditTrail(
    userId: string,
    limit = 50,
    offset = 0,
  ): Promise<{ items: Activity[]; total: number }> {
    const [items, total] = await this.activityRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { items, total };
  }

  /**
   * Get activity stats for dashboard widgets
   */
  async getStats(userId?: string): Promise<{
    totalEvents: number;
    commandsExecuted: number;
    errorsToday: number;
    avgExecDurationMs: number;
    byType: Record<string, number>;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const qb = this.activityRepo.createQueryBuilder('activity');
    const userQb = this.activityRepo.createQueryBuilder('activity');
    if (userId) {
      qb.andWhere('activity.userId = :userId', { userId });
      userQb.andWhere('activity.userId = :userId', { userId });
    }

    const totalEvents = await qb.getCount();

    const commandsExecuted = await userQb
      .clone()
      .andWhere('activity.type = :type', { type: ActivityType.COMMAND_EXECUTED })
      .getCount();

    const errorsToday = await userQb
      .clone()
      .andWhere('activity.isError = :isError', { isError: true })
      .andWhere('activity.createdAt >= :today', { today })
      .getCount();

    const avgResult = await userQb
      .clone()
      .select('AVG(activity.durationMs)', 'avg')
      .andWhere('activity.type = :type', {
        type: ActivityType.COMMAND_EXECUTED,
      })
      .andWhere('activity.durationMs IS NOT NULL')
      .getRawOne();

    const byTypeRows: { type: string; count: string }[] = await userQb
      .clone()
      .select('activity.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .groupBy('activity.type')
      .getRawMany();

    const byType: Record<string, number> = {};
    for (const row of byTypeRows) {
      byType[row.type] = Number(row.count);
    }

    return {
      totalEvents,
      commandsExecuted,
      errorsToday,
      avgExecDurationMs: Math.round(avgResult?.avg || 0),
      byType,
    };
  }

  /**
   * Export cryptographically verified SOC2 Type II / ISO-27001 Audit Trail
   * with HMAC-SHA256 chain integrity verification
   */
  async exportSoc2Audit(limit = 500) {
    const items = await this.activityRepo.find({
      order: { createdAt: 'ASC' },
      take: limit,
    });

    const crypto = await import('crypto');
    const hmacSecret = process.env.AUDIT_HMAC_SECRET || 'quarkbox-default-hmac-key-change-me';
    let chainValid = true;
    let previousHmac = '0'.repeat(64);

    const records = items.map((act) => {
      // Recompute expected HMAC for verification
      const payload = `${previousHmac}|${act.id}|${act.createdAt}|${act.type}|${act.userId || 'system'}|${act.sandboxId || ''}|${act.summary}`;
      const expectedHmac = crypto.createHmac('sha256', hmacSecret).update(payload).digest('hex');
      const recordValid = act.integrityHmac === expectedHmac;
      if (!recordValid) chainValid = false;

      previousHmac = act.integrityHmac || expectedHmac;

      return {
        recordId: act.id,
        timestamp: act.createdAt,
        type: act.type,
        actor: act.userId || 'system',
        sandboxId: act.sandboxId,
        summary: act.summary,
        isError: act.isError,
        durationMs: act.durationMs,
        integrityHmac: act.integrityHmac,
        chainValid: recordValid,
      };
    });

    const rootHash = crypto
      .createHmac('sha256', hmacSecret)
      .update(records.map((r) => r.integrityHmac).join(':'))
      .digest('hex');

    return {
      complianceStandard: 'SOC2-Type-II / ISO-27001 Cloud Security',
      organization: 'QuarkBox Autonomous Agent Cloud',
      exportedAt: new Date().toISOString(),
      recordCount: records.length,
      auditChainIntegrity: chainValid ? 'VERIFIED' : 'CHAIN_BROKEN',
      auditChainRootHmac: rootHash,
      hmacAlgorithm: 'HMAC-SHA256',
      records,
    };
  }
}
