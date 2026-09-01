import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHmac } from 'node:crypto';

import { WebhookService } from '../src/webhook/webhook.service';
import { Webhook } from '../src/webhook/webhook.entity';

function makeWebhook(overrides: Partial<Webhook> = {}): Webhook {
  return {
    id: 'wh-1',
    userId: 'user-1',
    url: 'https://example.com/hook',
    event: 'sandbox.created',
    active: true,
    secret: 'super-secret',
    deliveryCount: 0,
    failureCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('WebhookService', () => {
  let webhookService: WebhookService;
  const webhookRepo = {
    create: vi.fn(),
    save: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    remove: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: getRepositoryToken(Webhook), useValue: webhookRepo },
      ],
    }).compile();

    webhookService = module.get(WebhookService);
  });

  describe('create', () => {
    it('creates a webhook with provided secret', async () => {
      webhookRepo.create.mockImplementation((data: any) => ({ ...data, id: 'wh-1' }));
      webhookRepo.save.mockImplementation(async (w: Webhook) => w);

      const result = await webhookService.create('user-1', 'https://example.com/hook', 'sandbox.created', 'my-secret');

      expect(webhookRepo.create).toHaveBeenCalledWith({
        userId: 'user-1',
        url: 'https://example.com/hook',
        event: 'sandbox.created',
        secret: 'my-secret',
      });
      expect(result.secret).toBe('my-secret');
    });

    it('generates a default secret when omitted', async () => {
      webhookRepo.create.mockImplementation((data: any) => data);
      webhookRepo.save.mockResolvedValue(makeWebhook());

      const result = await webhookService.create('user-1', 'https://example.com/hook', 'sandbox.created');

      expect(result.secret).toBeDefined();
      expect(result.secret.length).toBeGreaterThan(0);
      expect(result.secret).not.toBe('my-secret');
    });

    it('rejects a non-http(s) url', async () => {
      await expect(
        webhookService.create('user-1', 'ftp://example.com/hook', 'sandbox.created'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('throws NotFound when webhook is missing', async () => {
      webhookRepo.findOne.mockResolvedValue(null);
      await expect(webhookService.remove('wh-1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound when webhook belongs to another user', async () => {
      webhookRepo.findOne.mockResolvedValue(makeWebhook({ userId: 'someone-else' }));
      await expect(webhookService.remove('wh-1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('removes the webhook for the owning user', async () => {
      const webhook = makeWebhook();
      webhookRepo.findOne.mockResolvedValue(webhook);
      webhookRepo.remove.mockResolvedValue(webhook);

      await webhookService.remove('wh-1', 'user-1');

      expect(webhookRepo.remove).toHaveBeenCalledWith(webhook);
    });
  });

  describe('dispatch', () => {
    it('returns early when no userId', async () => {
      await webhookService.dispatch('sandbox.created', undefined, { x: 1 });
      expect(webhookRepo.find).not.toHaveBeenCalled();
    });

    it('queries active webhooks for the event and user', async () => {
      webhookRepo.find.mockResolvedValue([makeWebhook()]);
      await webhookService.dispatch('sandbox.created', 'user-1', { id: 'sb-1' });
      expect(webhookRepo.find).toHaveBeenCalledWith({
        where: { event: 'sandbox.created', userId: 'user-1', active: true },
      });
    });
  });

  describe('deliver', () => {
    it('posts to the webhook url with HMAC signature and increments counters', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      webhookRepo.save.mockImplementation(async (w: Webhook) => w);

      const webhook = makeWebhook();
      await webhookService.deliver(webhook, { id: 'sb-1' });

      const [url, init] = (global.fetch as any).mock.calls[0];
      expect(url).toBe('https://example.com/hook');
      expect(init.method).toBe('POST');
      expect(init.headers['Content-Type']).toBe('application/json');
      expect(init.headers['X-QuarkBox-Signature']).toMatch(/^sha256=/);

      const body = JSON.parse(init.body);
      expect(body.event).toBe('sandbox.created');
      expect(body.payload).toEqual({ id: 'sb-1' });

      const expectedSig = createHmac('sha256', 'super-secret')
        .update(init.body)
        .digest('hex');
      expect(init.headers['X-QuarkBox-Signature']).toBe(`sha256=${expectedSig}`);

      expect(webhook.deliveryCount).toBe(1);
      expect(webhook.failureCount).toBe(0);
      expect(webhookRepo.save).toHaveBeenCalled();
    });

    it('increments failureCount when response is not ok', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      webhookRepo.save.mockImplementation(async (w: Webhook) => w);

      const webhook = makeWebhook();
      await webhookService.deliver(webhook, {});

      expect(webhook.deliveryCount).toBe(1);
      expect(webhook.failureCount).toBe(1);
      expect(webhookRepo.save).toHaveBeenCalled();
    });

    it('increments failureCount and persists on fetch error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
      webhookRepo.save.mockImplementation(async (w: Webhook) => w);

      const webhook = makeWebhook();
      await webhookService.deliver(webhook, {});

      expect(webhook.failureCount).toBe(1);
      expect(webhook.lastDeliveryAt).toBeInstanceOf(Date);
      expect(webhookRepo.save).toHaveBeenCalledWith(webhook);
    });

    it('omits signature header when webhook has no secret', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      webhookRepo.save.mockImplementation(async (w: Webhook) => w);

      const webhook = makeWebhook({ secret: '' });
      await webhookService.deliver(webhook, {});

      const [, init] = (global.fetch as any).mock.calls[0];
      expect(init.headers['X-QuarkBox-Signature']).toBeUndefined();
    });
  });
});
