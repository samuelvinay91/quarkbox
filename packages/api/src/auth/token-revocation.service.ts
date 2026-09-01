import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import * as crypto from 'node:crypto';
import { RevokedToken } from './revoked-token.entity';

@Injectable()
export class TokenRevocationService {
  private readonly logger = new Logger(TokenRevocationService.name);

  constructor(
    @InjectRepository(RevokedToken)
    private readonly revokedTokenRepo: Repository<RevokedToken>,
  ) {}

  /**
   * Revoke a token by storing its hash
   */
  async revoke(token: string, userId?: string, reason?: string): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Decode token to get expiry (so we can auto-cleanup later)
    let expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // default 24h
    try {
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64url').toString(),
      );
      if (payload.exp) {
        expiresAt = new Date(payload.exp * 1000);
      }
    } catch {
      // Use default expiry
    }

    const existing = await this.revokedTokenRepo.findOne({ where: { tokenHash } });
    if (!existing) {
      const record = this.revokedTokenRepo.create({
        tokenHash,
        userId,
        reason: reason || 'user_logout',
        expiresAt,
      });
      await this.revokedTokenRepo.save(record);
      this.logger.log(`Token revoked for user ${userId || 'unknown'}`);
    }
  }

  /**
   * Check if a token has been revoked
   */
  async isRevoked(token: string): Promise<boolean> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const record = await this.revokedTokenRepo.findOne({ where: { tokenHash } });
    return !!record;
  }

  /**
   * Cleanup expired revocation records (run periodically)
   */
  async cleanupExpired(): Promise<number> {
    const result = await this.revokedTokenRepo.delete({
      expiresAt: LessThan(new Date()),
    });
    return result.affected || 0;
  }
}
