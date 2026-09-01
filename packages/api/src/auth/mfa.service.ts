import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'node:crypto';
import { User } from '../user/user.entity';

/**
 * TOTP-based MFA service.
 * Implements RFC 6238 (TOTP) with HMAC-SHA1, 6-digit codes, 30-second steps.
 * No external dependency — uses Node.js crypto.
 */
@Injectable()
export class MfaService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * Generate a new MFA secret for a user (does NOT enable MFA yet)
   */
  async setupMfa(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');
    if (user.mfaEnabled) throw new BadRequestException('MFA is already enabled');

    // Generate a 20-byte random secret
    const secretBuffer = crypto.randomBytes(20);
    const secret = this.base32Encode(secretBuffer);

    // Store the secret (not yet enabled)
    await this.userRepo.update(userId, { mfaSecret: secret });

    // Build otpauth:// URL for QR code scanning
    const issuer = 'QuarkBox';
    const otpauthUrl = `otpauth://totp/${issuer}:${encodeURIComponent(user.email)}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

    return { secret, otpauthUrl };
  }

  /**
   * Verify a TOTP code and enable MFA if valid (first-time setup)
   */
  async verifyAndEnable(userId: string, code: string): Promise<{ enabled: boolean }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || !user.mfaSecret) throw new BadRequestException('MFA not set up');

    if (!this.verifyTotp(user.mfaSecret, code)) {
      throw new BadRequestException('Invalid MFA code');
    }

    await this.userRepo.update(userId, { mfaEnabled: true });
    return { enabled: true };
  }

  /**
   * Verify a TOTP code during login
   */
  async verifyCode(userId: string, code: string): Promise<boolean> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || !user.mfaSecret || !user.mfaEnabled) return false;
    return this.verifyTotp(user.mfaSecret, code);
  }

  /**
   * Disable MFA for a user (requires valid code)
   */
  async disableMfa(userId: string, code: string): Promise<{ disabled: boolean }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || !user.mfaEnabled) throw new BadRequestException('MFA is not enabled');

    if (!this.verifyTotp(user.mfaSecret!, code)) {
      throw new BadRequestException('Invalid MFA code');
    }

    await this.userRepo.update(userId, { mfaEnabled: false, mfaSecret: undefined });
    return { disabled: true };
  }

  /**
   * Check if a user has MFA enabled
   */
  async isMfaEnabled(userId: string): Promise<boolean> {
    const user = await this.userRepo.findOne({ where: { id: userId }, select: { mfaEnabled: true } });
    return user?.mfaEnabled === true;
  }

  // ── TOTP Implementation (RFC 6238) ────────────────────────────────

  private verifyTotp(secret: string, code: string, window = 1): boolean {
    const now = Math.floor(Date.now() / 1000);
    const step = 30;

    // Check current time step and ±window steps
    for (let i = -window; i <= window; i++) {
      const counter = Math.floor((now + i * step) / step);
      const expectedCode = this.generateTotp(secret, counter);
      if (expectedCode === code) return true;
    }
    return false;
  }

  private generateTotp(secret: string, counter: number): string {
    const secretBuffer = this.base32Decode(secret);

    // Convert counter to 8-byte big-endian buffer
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter));

    // HMAC-SHA1
    const hmac = crypto.createHmac('sha1', secretBuffer);
    hmac.update(counterBuffer);
    const digest = hmac.digest();

    // Dynamic truncation
    const offset = digest[digest.length - 1] & 0x0f;
    const binary =
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff);

    const otp = binary % 1000000;
    return otp.toString().padStart(6, '0');
  }

  private base32Encode(buffer: Buffer): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    let output = '';

    for (const byte of buffer) {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        output += alphabet[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) {
      output += alphabet[(value << (5 - bits)) & 31];
    }
    return output;
  }

  private base32Decode(encoded: string): Buffer {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    const output: number[] = [];

    for (const char of encoded.toUpperCase()) {
      const idx = alphabet.indexOf(char);
      if (idx === -1) continue;
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        output.push((value >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }
    return Buffer.from(output);
  }
}
