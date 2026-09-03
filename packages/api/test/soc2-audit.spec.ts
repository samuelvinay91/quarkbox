import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActivityService } from '../src/activity/activity.service';
import { Activity, ActivityType } from '../src/activity/activity.entity';
import * as crypto from 'node:crypto';

describe('ActivityService - SOC2 HMAC Chain & Audit Export', () => {
  let service: ActivityService;

  const mockRepo = {
    create: vi.fn(),
    save: vi.fn(),
    findOne: vi.fn(),
    find: vi.fn(),
    update: vi.fn(),
    findAndCount: vi.fn(),
    createQueryBuilder: vi.fn(),
  };

  const secret = 'test-audit-hmac-secret-key-12345';

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.AUDIT_HMAC_SECRET = secret;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityService,
        { provide: getRepositoryToken(Activity), useValue: mockRepo },
      ],
    }).compile();

    service = module.get(ActivityService);
  });

  describe('record with HMAC-SHA256 chaining', () => {
    it('computes HMAC chain using previous record hash and updates saved entity', async () => {
      const prevHmac = '0'.repeat(64);
      mockRepo.create.mockImplementation((val) => val);
      mockRepo.save.mockImplementation((val) => Promise.resolve({
        id: 'act-1',
        ...val,
        createdAt: new Date('2026-09-01T00:00:00Z'),
      }));
      mockRepo.findOne.mockResolvedValue(null); // No previous record -> defaults to 64 zeroes
      mockRepo.update.mockResolvedValue({ affected: 1 });

      const result = await service.record({
        type: ActivityType.SANDBOX_CREATED,
        summary: 'Created sandbox sb-1',
        sandboxId: 'sb-1',
        userId: 'u-1',
      });

      const payload = `${prevHmac}|act-1|${result.createdAt}|${result.type}|u-1|sb-1|Created sandbox sb-1`;
      const expectedHmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');

      expect(mockRepo.update).toHaveBeenCalledWith('act-1', { integrityHmac: expectedHmac });
      expect(result.integrityHmac).toBe(expectedHmac);
    });
  });

  describe('exportSoc2Audit', () => {
    it('verifies a valid unbroken HMAC chain', async () => {
      const date1 = new Date('2026-09-01T10:00:00Z');
      const date2 = new Date('2026-09-01T10:01:00Z');

      const prev0 = '0'.repeat(64);
      const payload1 = `${prev0}|rec-1|${date1}|${ActivityType.AUTH_LOGIN_SUCCESS}|u-1||User logged in`;
      const hmac1 = crypto.createHmac('sha256', secret).update(payload1).digest('hex');

      const payload2 = `${hmac1}|rec-2|${date2}|${ActivityType.COMMAND_EXECUTED}|u-1|sb-1|ls -la`;
      const hmac2 = crypto.createHmac('sha256', secret).update(payload2).digest('hex');

      const mockItems: Partial<Activity>[] = [
        {
          id: 'rec-1',
          createdAt: date1,
          type: ActivityType.AUTH_LOGIN_SUCCESS,
          userId: 'u-1',
          sandboxId: undefined,
          summary: 'User logged in',
          isError: false,
          integrityHmac: hmac1,
        },
        {
          id: 'rec-2',
          createdAt: date2,
          type: ActivityType.COMMAND_EXECUTED,
          userId: 'u-1',
          sandboxId: 'sb-1',
          summary: 'ls -la',
          isError: false,
          integrityHmac: hmac2,
        },
      ];

      mockRepo.find.mockResolvedValue(mockItems);

      const exportData = await service.exportSoc2Audit(50);

      expect(exportData.auditChainIntegrity).toBe('VERIFIED');
      expect(exportData.records).toHaveLength(2);
      expect(exportData.records[0].chainValid).toBe(true);
      expect(exportData.records[1].chainValid).toBe(true);
      expect(exportData.hmacAlgorithm).toBe('HMAC-SHA256');
      expect(exportData.auditChainRootHmac).toBeDefined();
    });

    it('detects tampering and flags CHAIN_BROKEN when a record HMAC is altered', async () => {
      const date1 = new Date('2026-09-01T10:00:00Z');
      const mockItems: Partial<Activity>[] = [
        {
          id: 'rec-1',
          createdAt: date1,
          type: ActivityType.AUTH_LOGIN_SUCCESS,
          userId: 'u-1',
          summary: 'Tampered summary',
          isError: false,
          integrityHmac: 'bad-tampered-hmac-signature-value',
        },
      ];

      mockRepo.find.mockResolvedValue(mockItems);

      const exportData = await service.exportSoc2Audit(50);

      expect(exportData.auditChainIntegrity).toBe('CHAIN_BROKEN');
      expect(exportData.records[0].chainValid).toBe(false);
    });
  });
});
