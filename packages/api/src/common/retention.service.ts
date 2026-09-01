import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Activity } from '../activity/activity.entity';
import { ActivityType } from '../activity/activity.entity';
import { ActivityService } from '../activity/activity.service';
import { RevokedToken } from '../auth/revoked-token.entity';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Data Retention & Log Rotation Service
 * SOC2 CC7.2 — Ensures audit data is retained for compliance periods
 * and old data is safely archived/purged.
 *
 * Environment variables:
 *   AUDIT_RETENTION_DAYS         — Days to retain audit records (default: 395 = ~13 months)
 *   SANDBOX_RETENTION_DAYS       — Days to retain deleted sandbox metadata (default: 90)
 *   AUDIT_LOG_MAX_SIZE_MB        — Max NDJSON file size before rotation (default: 100)
 *   AUDIT_LOG_PATH               — Path to audit log file
 *   AUDIT_LOG_ARCHIVE_DIR        — Directory for rotated log archives
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    @InjectRepository(Activity)
    private readonly activityRepo: Repository<Activity>,
    @InjectRepository(RevokedToken)
    private readonly revokedTokenRepo: Repository<RevokedToken>,
    private readonly activityService: ActivityService,
  ) {}

  /**
   * Run daily at 2:00 AM — clean up expired revoked tokens
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupRevokedTokens() {
    try {
      const result = await this.revokedTokenRepo.delete({
        expiresAt: LessThan(new Date()),
      });
      const count = result.affected || 0;
      if (count > 0) {
        this.logger.log(`Cleaned up ${count} expired revoked tokens`);
      }
    } catch (err: any) {
      this.logger.error(`Failed to cleanup revoked tokens: ${err.message}`);
    }
  }

  /**
   * Run weekly on Sunday at 3:00 AM — archive old audit records
   */
  @Cron(CronExpression.EVERY_WEEK)
  async archiveOldAuditRecords() {
    try {
      const retentionDays = parseInt(process.env.AUDIT_RETENTION_DAYS || '395', 10);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      // Count records beyond retention period
      const count = await this.activityRepo.count({
        where: { createdAt: LessThan(cutoffDate) },
      });

      if (count === 0) {
        this.logger.debug('No audit records beyond retention period');
        return;
      }

      // Export to archive before deletion
      const archiveDir = process.env.AUDIT_LOG_ARCHIVE_DIR || '/var/log/quarkbox/archive';
      await fs.promises.mkdir(archiveDir, { recursive: true });

      const archiveName = `audit-archive-${cutoffDate.toISOString().split('T')[0]}.ndjson`;
      const archivePath = path.join(archiveDir, archiveName);

      const oldRecords = await this.activityRepo.find({
        where: { createdAt: LessThan(cutoffDate) },
        order: { createdAt: 'ASC' },
      });

      // Write archive
      const archiveData = oldRecords.map((r) => JSON.stringify(r)).join('\n') + '\n';
      await fs.promises.writeFile(archivePath, archiveData, { flag: 'wx' }); // wx = fail if exists

      // Delete archived records
      await this.activityRepo.delete({ createdAt: LessThan(cutoffDate) as any });

      // Record the cleanup event itself
      await this.activityService.record({
        type: ActivityType.RETENTION_CLEANUP,
        summary: `Archived and purged ${count} audit records older than ${retentionDays} days`,
        metadata: {
          archivedCount: count,
          archivePath,
          retentionDays,
          cutoffDate: cutoffDate.toISOString(),
        },
      });

      this.logger.log(`Archived ${count} audit records to ${archivePath}`);
    } catch (err: any) {
      this.logger.error(`Failed to archive audit records: ${err.message}`);
    }
  }

  /**
   * Run every 6 hours — rotate audit log file if it exceeds max size
   */
  @Cron('0 */6 * * *')
  async rotateAuditLog() {
    try {
      const auditLogPath = process.env.AUDIT_LOG_PATH || '/var/log/quarkbox/audit.ndjson';
      const maxSizeMb = parseInt(process.env.AUDIT_LOG_MAX_SIZE_MB || '100', 10);
      const maxSizeBytes = maxSizeMb * 1024 * 1024;

      let stat: fs.Stats;
      try {
        stat = await fs.promises.stat(auditLogPath);
      } catch {
        return; // File doesn't exist yet
      }

      if (stat.size < maxSizeBytes) {
        return; // File is within limits
      }

      // Rotate: rename current file with timestamp suffix
      const archiveDir = process.env.AUDIT_LOG_ARCHIVE_DIR || '/var/log/quarkbox/archive';
      await fs.promises.mkdir(archiveDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const rotatedName = `audit-${timestamp}.ndjson`;
      const rotatedPath = path.join(archiveDir, rotatedName);

      await fs.promises.rename(auditLogPath, rotatedPath);

      this.logger.log(
        `Rotated audit log (${(stat.size / 1024 / 1024).toFixed(1)}MB) → ${rotatedPath}`,
      );
    } catch (err: any) {
      this.logger.error(`Failed to rotate audit log: ${err.message}`);
    }
  }

  /**
   * Get current retention status for monitoring/dashboards
   */
  async getRetentionStatus(): Promise<{
    totalAuditRecords: number;
    oldestRecordDate: string | null;
    revokedTokensPendingCleanup: number;
    auditLogSizeMb: number | null;
    retentionDays: number;
  }> {
    const totalAuditRecords = await this.activityRepo.count();

    const oldest = await this.activityRepo.findOne({
      order: { createdAt: 'ASC' },
      select: { createdAt: true },
    });

    const revokedTokensPendingCleanup = await this.revokedTokenRepo.count({
      where: { expiresAt: LessThan(new Date()) },
    });

    let auditLogSizeMb: number | null = null;
    try {
      const auditLogPath = process.env.AUDIT_LOG_PATH || '/var/log/quarkbox/audit.ndjson';
      const stat = await fs.promises.stat(auditLogPath);
      auditLogSizeMb = parseFloat((stat.size / 1024 / 1024).toFixed(2));
    } catch {
      // File doesn't exist
    }

    return {
      totalAuditRecords,
      oldestRecordDate: oldest?.createdAt?.toISOString() || null,
      revokedTokensPendingCleanup,
      auditLogSizeMb,
      retentionDays: parseInt(process.env.AUDIT_RETENTION_DAYS || '395', 10),
    };
  }
}
