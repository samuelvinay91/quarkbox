import { describe, it, expect } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateSandboxDto } from '../src/sandbox/dto';
import { CreateWebhookDto, WEBHOOK_EVENTS } from '../src/webhook/dto';

async function expectValid(dto: any, value: Record<string, any>) {
  const instance = plainToInstance(dto, value);
  const errors = await validate(instance as object);
  expect(errors.length).toBe(0);
}

async function expectInvalid(dto: any, value: Record<string, any>, needle?: string) {
  const instance = plainToInstance(dto, value);
  const errors = await validate(instance as object);
  expect(errors.length).toBeGreaterThan(0);
  if (needle) {
    const messages = JSON.stringify(errors.map((e) => e.constraints));
    expect(messages).toContain(needle);
  }
}

describe('CreateSandboxDto validation', () => {
  const valid = { name: 'my-sandbox' };

  describe('name', () => {
    it('accepts a valid name', async () => {
      await expectValid(CreateSandboxDto, valid);
    });

    it('accepts names with hyphens and underscores', async () => {
      await expectValid(CreateSandboxDto, { name: 'my_sandbox-2' });
    });

    it('rejects names with spaces', async () => {
      await expectInvalid(CreateSandboxDto, { name: 'my sandbox' }, 'must start with alphanumeric');
    });

    it('rejects names starting with a non-alphanumeric char', async () => {
      await expectInvalid(CreateSandboxDto, { name: '-sandbox' });
    });

    it('rejects names with special characters', async () => {
      await expectInvalid(CreateSandboxDto, { name: 'my;sandbox' });
      await expectInvalid(CreateSandboxDto, { name: 'my/sandbox' });
      await expectInvalid(CreateSandboxDto, { name: 'my sandbox!' });
    });

    it('rejects names longer than 255 chars', async () => {
      await expectInvalid(CreateSandboxDto, { name: 'a'.repeat(256) }, 'must be shorter');
    });

    it('rejects missing name', async () => {
      await expectInvalid(CreateSandboxDto, {}, 'name must be a string');
    });
  });

  describe('cpuLimit', () => {
    it('accepts valid cpu values', async () => {
      await expectValid(CreateSandboxDto, { ...valid, cpuLimit: 1 });
      await expectValid(CreateSandboxDto, { ...valid, cpuLimit: 16 });
    });

    it('rejects cpu below 1', async () => {
      await expectInvalid(CreateSandboxDto, { ...valid, cpuLimit: 0 });
    });

    it('rejects cpu above 16', async () => {
      await expectInvalid(CreateSandboxDto, { ...valid, cpuLimit: 17 });
    });

    it('rejects non-integer cpu', async () => {
      await expectInvalid(CreateSandboxDto, { ...valid, cpuLimit: 1.5 });
    });
  });

  describe('memoryLimit / diskLimit', () => {
    it('accepts valid size strings', async () => {
      await expectValid(CreateSandboxDto, { ...valid, memoryLimit: '512m' });
      await expectValid(CreateSandboxDto, { ...valid, memoryLimit: '2g' });
      await expectValid(CreateSandboxDto, { ...valid, diskLimit: '10g' });
    });

    it('rejects malformed memory strings', async () => {
      await expectInvalid(CreateSandboxDto, { ...valid, memoryLimit: 'abc' }, 'Memory must be in format');
      await expectInvalid(CreateSandboxDto, { ...valid, memoryLimit: '2Gb' }, 'Memory must be in format');
      await expectInvalid(CreateSandboxDto, { ...valid, memoryLimit: '' }, 'Memory must be in format');
    });

    it('rejects malformed disk strings', async () => {
      await expectInvalid(CreateSandboxDto, { ...valid, diskLimit: 'ten-gig' }, 'Disk must be in format');
    });
  });

  describe('runtime', () => {
    it('accepts a valid runtime enum value', async () => {
      await expectValid(CreateSandboxDto, { ...valid, runtime: 'docker' });
    });

    it('rejects an invalid runtime', async () => {
      await expectInvalid(CreateSandboxDto, { ...valid, runtime: 'nope' }, 'must be one of the following values');
    });
  });

  describe('optional objects', () => {
    it('rejects non-object ports', async () => {
      await expectInvalid(CreateSandboxDto, { ...valid, ports: '3000' });
    });

    it('rejects non-object envVars', async () => {
      await expectInvalid(CreateSandboxDto, { ...valid, envVars: ['A=1'] });
    });

    it('rejects non-object labels', async () => {
      await expectInvalid(CreateSandboxDto, { ...valid, labels: 'x' });
    });

    it('accepts object values', async () => {
      await expectValid(CreateSandboxDto, {
        ...valid,
        ports: { '3000': '3000' },
        envVars: { NODE_ENV: 'development' },
        labels: { project: 'ml' },
      });
    });
  });
});

describe('CreateWebhookDto validation', () => {
  const valid = { url: 'https://example.com/webhook', event: 'sandbox.created' };

  it('accepts a valid webhook payload', async () => {
    await expectValid(CreateWebhookDto, valid);
  });

  it('accepts any registered event', async () => {
    for (const event of WEBHOOK_EVENTS) {
      await expectValid(CreateWebhookDto, { ...valid, event });
    }
  });

  it('rejects an unregistered event', async () => {
    await expectInvalid(CreateWebhookDto, { ...valid, event: 'sandbox.exploded' }, 'must be one of');
  });

  it('rejects a non-URL', async () => {
    await expectInvalid(CreateWebhookDto, { ...valid, url: 'not a url' }, 'url must be a URL');
  });

  it('rejects a missing url', async () => {
    await expectInvalid(CreateWebhookDto, { event: 'sandbox.created' });
  });

  it('rejects an over-long secret', async () => {
    await expectInvalid(CreateWebhookDto, { ...valid, secret: 'x'.repeat(101) }, 'must be shorter');
  });

  it('accepts an optional secret', async () => {
    await expectValid(CreateWebhookDto, { ...valid, secret: 'my-secret' });
  });
});
