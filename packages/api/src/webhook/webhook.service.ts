import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Webhook } from './webhook.entity';
import { createHmac, randomBytes } from 'node:crypto';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectRepository(Webhook)
    private readonly webhookRepo: Repository<Webhook>,
  ) {}

  async create(userId: string, url: string, event: string, secret?: string): Promise<Webhook> {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      throw new BadRequestException('Webhook URL must use http or https protocol');
    }
    const webhook = this.webhookRepo.create({
      userId,
      url,
      event,
      secret: secret || randomBytes(32).toString('hex'),
    });
    return this.webhookRepo.save(webhook);
  }

  async listForUser(userId: string): Promise<Webhook[]> {
    return this.webhookRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async remove(id: string, userId: string): Promise<void> {
    const webhook = await this.webhookRepo.findOne({ where: { id } });
    if (!webhook) {
      throw new NotFoundException(`Webhook ${id} not found`);
    }
    if (webhook.userId !== userId) {
      throw new NotFoundException(`Webhook ${id} not found`);
    }
    await this.webhookRepo.remove(webhook);
  }

  async dispatch(event: string, userId: string | undefined, payload: Record<string, unknown>): Promise<void> {
    if (!userId) {
      return;
    }
    const webhooks = await this.webhookRepo.find({
      where: { event, userId, active: true },
    });
    for (const webhook of webhooks) {
      queueMicrotask(() => this.deliver(webhook, payload));
    }
  }

  async deliver(webhook: Webhook, payload: Record<string, unknown>): Promise<void> {
    try {
      const body = JSON.stringify({ event: webhook.event, payload, deliveredAt: new Date().toISOString() });
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (webhook.secret) {
        const signature = createHmac('sha256', webhook.secret).update(body).digest('hex');
        headers['X-QuarkBox-Signature'] = `sha256=${signature}`;
      }
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body,
      });
      webhook.deliveryCount++;
      webhook.lastDeliveryAt = new Date();
      if (!response.ok) {
        webhook.failureCount++;
        this.logger.warn(`Webhook ${webhook.id} delivered with status ${response.status}`);
      }
      await this.webhookRepo.save(webhook);
    } catch (error) {
      webhook.failureCount++;
      webhook.lastDeliveryAt = new Date();
      await this.webhookRepo.save(webhook);
      this.logger.warn(`Webhook ${webhook.id} delivery failed: ${error}`);
    }
  }
}
