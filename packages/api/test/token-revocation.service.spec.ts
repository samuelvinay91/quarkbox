import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TokenRevocationService } from '../src/auth/token-revocation.service';
import { RevokedToken } from '../src/auth/revoked-token.entity';
import * as crypto from 'node:crypto';

describe('TokenRevocationService', () => {
  let service: TokenRevocationService;

  const mockRepo = {
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenRevocationService,
        { provide: getRepositoryToken(RevokedToken), useValue: mockRepo },
      ],
    }).compile();

    service = module.get(TokenRevocationService);
  });

  describe('revoke', () => {
    it('creates and saves a token revocation record with SHA-256 hash', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      mockRepo.create.mockImplementation((dto) => dto);
      mockRepo.save.mockImplementation((dto) => Promise.resolve({ id: 'rt-1', ...dto }));

      const rawToken = 'header.payload.signature';
      const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      await service.revoke(rawToken, 'user-123', 'user_logout');

      expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { tokenHash: expectedHash } });
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenHash: expectedHash,
          userId: 'user-123',
          reason: 'user_logout',
        }),
      );
      expect(mockRepo.save).toHaveBeenCalled();
    });

    it('extracts JWT exp timestamp from base64url payload when valid', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      mockRepo.create.mockImplementation((dto) => dto);
      mockRepo.save.mockImplementation((dto) => Promise.resolve(dto));

      const expSeconds = Math.floor(Date.now() / 1000) + 7200; // 2 hours from now
      const payloadBase64 = Buffer.from(JSON.stringify({ sub: 'user-1', exp: expSeconds })).toString('base64url');
      const token = `eyJhbGciOiJIUzI1NiJ9.${payloadBase64}.signature`;

      await service.revoke(token, 'user-1');

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          expiresAt: new Date(expSeconds * 1000),
        }),
      );
    });

    it('does not save duplicate if already revoked', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 'existing' });

      await service.revoke('already-revoked-token');

      expect(mockRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('isRevoked', () => {
    it('returns true when token hash exists in revocation store', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 'found' });
      const result = await service.isRevoked('my-token');
      expect(result).toBe(true);
    });

    it('returns false when token hash is not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      const result = await service.isRevoked('unrevoked-token');
      expect(result).toBe(false);
    });
  });

  describe('cleanupExpired', () => {
    it('deletes tokens where expiresAt is less than current date', async () => {
      mockRepo.delete.mockResolvedValue({ affected: 5 });

      const count = await service.cleanupExpired();

      expect(count).toBe(5);
      expect(mockRepo.delete).toHaveBeenCalled();
    });
  });
});
