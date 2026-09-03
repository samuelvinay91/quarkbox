import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { MfaService } from '../src/auth/mfa.service';
import { User } from '../src/user/user.entity';

describe('MfaService', () => {
  let mfaService: MfaService;

  const mockUserRepo = {
    findOne: vi.fn(),
    update: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MfaService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
      ],
    }).compile();

    mfaService = module.get(MfaService);
  });

  describe('setupMfa', () => {
    it('throws if user not found', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      await expect(mfaService.setupMfa('nonexistent')).rejects.toThrow(BadRequestException);
    });

    it('throws if MFA is already enabled', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 'u1', mfaEnabled: true });
      await expect(mfaService.setupMfa('u1')).rejects.toThrow('MFA is already enabled');
    });

    it('generates a 32-character Base32 secret and valid otpauth URL', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 'u1', email: 'alice@quarkbox.io', mfaEnabled: false });
      mockUserRepo.update.mockResolvedValue({ affected: 1 });

      const result = await mfaService.setupMfa('u1');

      expect(result.secret).toBeDefined();
      expect(result.secret.length).toBe(32);
      expect(result.otpauthUrl).toContain('otpauth://totp/QuarkBox:alice%40quarkbox.io');
      expect(result.otpauthUrl).toContain(`secret=${result.secret}`);
      expect(mockUserRepo.update).toHaveBeenCalledWith('u1', { mfaSecret: result.secret });
    });
  });

  describe('verifyAndEnable & verifyCode', () => {
    it('throws if MFA secret is not set up', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 'u1', mfaSecret: null });
      await expect(mfaService.verifyAndEnable('u1', '123456')).rejects.toThrow('MFA not set up');
    });

    it('throws on invalid TOTP code during initial setup', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 'u1', mfaSecret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP' });
      await expect(mfaService.verifyAndEnable('u1', '000000')).rejects.toThrow('Invalid MFA code');
    });

    it('successfully verifies and enables MFA with valid TOTP code', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 'u1', email: 'alice@quarkbox.io', mfaEnabled: false });
      mockUserRepo.update.mockResolvedValue({ affected: 1 });

      const { secret } = await mfaService.setupMfa('u1');
      const validCode = (mfaService as any).generateTotp(secret, Math.floor(Date.now() / 30000));

      mockUserRepo.findOne.mockResolvedValue({ id: 'u1', mfaSecret: secret, mfaEnabled: false });
      const enableResult = await mfaService.verifyAndEnable('u1', validCode);

      expect(enableResult).toEqual({ enabled: true });
      expect(mockUserRepo.update).toHaveBeenCalledWith('u1', { mfaEnabled: true });
    });

    it('returns false for verifyCode if MFA is not enabled', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 'u1', mfaSecret: 'SECRET', mfaEnabled: false });
      const result = await mfaService.verifyCode('u1', '123456');
      expect(result).toBe(false);
    });

    it('returns true for verifyCode with valid TOTP code', async () => {
      const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
      mockUserRepo.findOne.mockResolvedValue({ id: 'u1', mfaSecret: secret, mfaEnabled: true });

      const validCode = (mfaService as any).generateTotp(secret, Math.floor(Date.now() / 30000));
      const result = await mfaService.verifyCode('u1', validCode);

      expect(result).toBe(true);
    });
  });

  describe('disableMfa', () => {
    it('throws if MFA is not currently enabled', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 'u1', mfaEnabled: false });
      await expect(mfaService.disableMfa('u1', '123456')).rejects.toThrow('MFA is not enabled');
    });

    it('throws if invalid code provided', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 'u1', mfaSecret: 'SECRET', mfaEnabled: true });
      await expect(mfaService.disableMfa('u1', '999999')).rejects.toThrow('Invalid MFA code');
    });

    it('disables MFA and clears secret with valid code', async () => {
      const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
      mockUserRepo.findOne.mockResolvedValue({ id: 'u1', mfaSecret: secret, mfaEnabled: true });
      mockUserRepo.update.mockResolvedValue({ affected: 1 });

      const validCode = (mfaService as any).generateTotp(secret, Math.floor(Date.now() / 30000));
      const result = await mfaService.disableMfa('u1', validCode);

      expect(result).toEqual({ disabled: true });
      expect(mockUserRepo.update).toHaveBeenCalledWith('u1', { mfaEnabled: false, mfaSecret: undefined });
    });
  });

  describe('isMfaEnabled', () => {
    it('returns true when enabled', async () => {
      mockUserRepo.findOne.mockResolvedValue({ mfaEnabled: true });
      expect(await mfaService.isMfaEnabled('u1')).toBe(true);
    });

    it('returns false when disabled or user not found', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      expect(await mfaService.isMfaEnabled('u1')).toBe(false);
    });
  });
});
