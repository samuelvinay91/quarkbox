import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RetentionService } from '../src/common/retention.service';
import { Activity } from '../src/activity/activity.entity';
import { RevokedToken } from '../src/auth/revoked-token.entity';
import { ActivityService } from '../src/activity/activity.service';
import * as fs from 'node:fs';

vi.mock('node:fs', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    promises: {
      ...actual.promises,
      stat: vi.fn(),
      mkdir: vi.fn().mockResolvedValue(undefined),
      rename: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
    },
  };
});

describe('RetentionService', () => {
  let service: RetentionService;

  const mockActivityRepo = {
    count: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    delete: vi.fn(),
  };

  const mockRevokedTokenRepo = {
    count: vi.fn(),
    delete: vi.fn(),
  };

  const mockActivityService = {
    record: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetentionService,
        { provide: getRepositoryToken(Activity), useValue: mockActivityRepo },
        { provide: getRepositoryToken(RevokedToken), useValue: mockRevokedTokenRepo },
        { provide: ActivityService, useValue: mockActivityService },
      ],
    }).compile();

    service = module.get(RetentionService);
  });

  describe('cleanupRevokedTokens', () => {
    it('deletes expired revoked tokens', async () => {
      mockRevokedTokenRepo.delete.mockResolvedValue({ affected: 12 });

      await service.cleanupRevokedTokens();

      expect(mockRevokedTokenRepo.delete).toHaveBeenCalled();
    });
  });

  describe('archiveOldAuditRecords', () => {
    it('does nothing when no records are beyond retention threshold', async () => {
      mockActivityRepo.count.mockResolvedValue(0);

      await service.archiveOldAuditRecords();

      expect(mockActivityRepo.find).not.toHaveBeenCalled();
      expect(mockActivityRepo.delete).not.toHaveBeenCalled();
    });

    it('archives and purges records when older than retention window', async () => {
      mockActivityRepo.count.mockResolvedValue(50);
      mockActivityRepo.find.mockResolvedValue([
        { id: 'act-1', summary: 'Old activity', createdAt: new Date() },
      ]);
      mockActivityRepo.delete.mockResolvedValue({ affected: 50 });

      await service.archiveOldAuditRecords();

      expect(fs.promises.mkdir).toHaveBeenCalled();
      expect(fs.promises.writeFile).toHaveBeenCalled();
      expect(mockActivityRepo.delete).toHaveBeenCalled();
      expect(mockActivityService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: expect.stringContaining('Archived and purged 50 audit records'),
        }),
      );
    });
  });

  describe('rotateAuditLog', () => {
    it('does not rotate if file size is below max limit', async () => {
      vi.mocked(fs.promises.stat).mockResolvedValue({ size: 1024 * 1024 } as any); // 1MB, limit is 100MB

      await service.rotateAuditLog();

      expect(fs.promises.rename).not.toHaveBeenCalled();
    });

    it('rotates file when size exceeds max threshold', async () => {
      vi.mocked(fs.promises.stat).mockResolvedValue({ size: 150 * 1024 * 1024 } as any); // 150MB

      await service.rotateAuditLog();

      expect(fs.promises.mkdir).toHaveBeenCalled();
      expect(fs.promises.rename).toHaveBeenCalled();
    });
  });

  describe('getRetentionStatus', () => {
    it('returns aggregated metrics for retention dashboard', async () => {
      mockActivityRepo.count.mockResolvedValue(2400);
      mockActivityRepo.findOne.mockResolvedValue({ createdAt: new Date('2025-01-01T00:00:00.000Z') });
      mockRevokedTokenRepo.count.mockResolvedValue(3);
      vi.mocked(fs.promises.stat).mockResolvedValue({ size: 10 * 1024 * 1024 } as any); // 10MB

      const status = await service.getRetentionStatus();

      expect(status.totalAuditRecords).toBe(2400);
      expect(status.oldestRecordDate).toBe('2025-01-01T00:00:00.000Z');
      expect(status.revokedTokensPendingCleanup).toBe(3);
      expect(status.auditLogSizeMb).toBe(10);
      expect(status.retentionDays).toBe(395);
    });
  });
});
