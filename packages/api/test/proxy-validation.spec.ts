import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';

import { ProxyService } from '../src/proxy/proxy.service';
import { SandboxService } from '../src/sandbox/sandbox.service';

describe('ProxyService validation (regression defense)', () => {
  let proxyService: ProxyService;
  const mockSandboxService = {
    findOne: vi.fn().mockResolvedValue({ id: 'sandbox-1', containerIp: '172.17.0.2' }),
    exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '{}', stderr: '' }),
  };

  const mockRes = () =>
    ({
      status: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
      send: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    }) as any;

  beforeEach(() => {
    proxyService = new ProxyService(mockSandboxService as unknown as SandboxService);
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: { forEach: (cb: any) => {}, get: () => undefined },
      arrayBuffer: async () => new ArrayBuffer(0),
    } as any);
  });

  describe('subpath validation', () => {
    it('should throw for path traversal attempts', async () => {
      for (const malicious of [
        '..%2f..%2fetc%2fpasswd',
        '..',
        '../../etc/passwd',
        '..\\..\\Windows',
        'a b c',
        'foo;rm -rf',
        "$(whoami)",
        '`id`',
      ]) {
        await expect(
          proxyService.forwardRequest('sandbox-1', 80, malicious, 'GET', {}, null, mockRes() as any),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('should accept safe subpaths', async () => {
      for (const safe of ['health', 'api/v1/users', 'index.html', 'a_b-c.1', '']) {
        await expect(
          proxyService.forwardRequest('sandbox-1', 80, safe, 'GET', {}, null, mockRes() as any),
        ).resolves.toBeUndefined();
      }
    });
  });

  describe('method validation', () => {
    it('should throw for non-uppercase or invalid methods', async () => {
      for (const method of ['get', 'Post', 'GET;DROP', 'GE T', '']) {
        await expect(
          proxyService.forwardRequest('sandbox-1', 80, 'health', method, {}, null, mockRes() as any),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('should accept safe uppercase methods', async () => {
      for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']) {
        await expect(
          proxyService.forwardRequest('sandbox-1', 80, 'health', method, {}, null, mockRes() as any),
        ).resolves.toBeUndefined();
      }
    });
  });

  describe('port validation', () => {
    it('should throw for invalid ports', async () => {
      for (const port of [0, -1, 65536, 999999, 1.5, NaN]) {
        await expect(
          proxyService.forwardRequest('sandbox-1', port as number, 'health', 'GET', {}, null, mockRes() as any),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('should accept valid port range', async () => {
      for (const port of [1, 80, 3000, 65535]) {
        await expect(
          proxyService.forwardRequest('sandbox-1', port, 'health', 'GET', {}, null, mockRes() as any),
        ).resolves.toBeUndefined();
      }
    });
  });

  describe('header filtering', () => {
    it('should not pass hop-by-hop headers to the upstream', async () => {
      const res = mockRes();
      global.fetch = vi.fn().mockResolvedValue({
        status: 200,
        headers: { forEach: (cb: any) => {} },
        arrayBuffer: async () => new ArrayBuffer(0),
      } as any);

      await proxyService.forwardRequest(
        'sandbox-1',
        80,
        'health',
        'GET',
        {
          host: 'evil.com',
          connection: 'keep-alive',
          'content-length': '100',
          'x-forwarded-for': '1.2.3.4',
          accept: 'application/json',
        },
        null,
        res as any,
      );

      const [url, init] = (global.fetch as any).mock.calls[0];
      expect(url).toBe('http://172.17.0.2:80/health');
      expect(init.headers['host']).toBeUndefined();
      expect(init.headers['connection']).toBeUndefined();
      expect(init.headers['content-length']).toBeUndefined();
      expect(init.headers['x-forwarded-for']).toBe('1.2.3.4');
      expect(init.headers['accept']).toBe('application/json');
    });
  });
});
