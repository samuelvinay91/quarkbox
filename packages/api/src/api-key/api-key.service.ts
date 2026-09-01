import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'node:crypto';
import { ApiKey } from './api-key.entity';
import { User } from '../user/user.entity';

@Injectable()
export class ApiKeyService {
  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeyRepo: Repository<ApiKey>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async generate(userId: string, name: string): Promise<{ key: string; keyPrefix: string; id: string }> {
    const rawBytes = crypto.randomBytes(32);
    const key = `qkb_${rawBytes.toString('hex')}`;
    const keyPrefix = key.slice(0, 8);
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');

    const apiKey = this.apiKeyRepo.create({ name, keyHash, keyPrefix, userId });
    const saved = await this.apiKeyRepo.save(apiKey);

    return { key, keyPrefix, id: saved.id };
  }

  async validate(apiKey: string): Promise<User | null> {
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    const apiKeyRecord = await this.apiKeyRepo.findOne({ where: { keyHash } });
    if (!apiKeyRecord) return null;

    if (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt < new Date()) {
      return null;
    }

    await this.apiKeyRepo.update(apiKeyRecord.id, { lastUsedAt: new Date() });

    const user = await this.userRepo.findOne({ where: { id: apiKeyRecord.userId } });
    if (!user || !user.isActive) return null;

    return user;
  }

  async revoke(keyId: string, userId: string): Promise<void> {
    const apiKey = await this.apiKeyRepo.findOne({ where: { id: keyId } });
    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }
    if (apiKey.userId !== userId) {
      throw new ForbiddenException('Not authorized to revoke this key');
    }
    await this.apiKeyRepo.remove(apiKey);
  }

  async listByUser(userId: string): Promise<Pick<ApiKey, 'id' | 'name' | 'keyPrefix' | 'lastUsedAt' | 'expiresAt' | 'createdAt'>[]> {
    return this.apiKeyRepo.find({
      where: { userId },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }
}
