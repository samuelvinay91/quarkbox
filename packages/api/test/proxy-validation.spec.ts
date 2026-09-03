import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';

import { ProxyService } from '../src/proxy/proxy.service';
import { SandboxService } from '../src/sandbox/sandbox.service';

describe('ProxyService validation (regression defense)', () => {
  let proxyService: ProxyService;
  const mockSandboxService = {
    findOne: vi.fn().mockResolvedValue({ id: 'sandbox-1', containerIp: '172.17.0.2' }),
    exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '{}', stderr: '' }),
  };

  const mockRes = () => {
    const res: any = {
      status: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
      send: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      flushHeaders: vi.fn(),
      write: vi.fn(),
      writableEnded: false,
      on: vi.fn(),
    };
    res.end = vi.fn(() => {
      res.writableEnded = true;
    });
    return res;
  };

  // Minimal web-standard ReadableStream mock so `Readable.fromWeb(...)` has
  // something valid to convert, without pulling in a real network stack.
  const streamOf = (chunks: string[]) => {
    let i = 0;
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (i < chunks.length) {
          controller.enqueue(new TextEncoder().encode(chunks[i++]));
        } else {
          controller.close();
        }
      },
    });
  };

  beforeEach(() => {
    proxyService = new ProxyService(mockSandboxService as unknown as SandboxService);
    vi.restoreAllMocks();
    // vi.restoreAllMocks() only restores vi.spyOn() spies — mockSandboxService's
    // plain vi.fn()s keep accumulating call history across tests otherwise,
    // which the streaming-behavior assertions below depend on being fresh.
    mockSandboxService.findOne.mockClear();
    mockSandboxService.exec.mockClear();
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

  describe('streaming behavior', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('streams progressive chunks instead of buffering the whole response', async () => {
      const res = mockRes();
      global.fetch = vi.fn().mockResolvedValue({
        status: 200,
        headers: { forEach: (cb: any) => cb('text/event-stream', 'content-type') },
        body: streamOf(['event: a\n\n', 'event: b\n\n', 'event: c\n\n']),
      } as any);

      await proxyService.forwardRequest('sandbox-1', 80, 'health', 'GET', {}, null, res as any);

      expect(res.flushHeaders).toHaveBeenCalled();
      expect(res.write.mock.calls.length).toBeGreaterThan(1);
      expect(res.send).not.toHaveBeenCalled();
      expect(res.end).toHaveBeenCalled();
    });

    it('still falls back to the exec path when the port never responds before the connect timeout', async () => {
      vi.useFakeTimers();
      const res = mockRes();

      global.fetch = vi.fn((_url: RequestInfo | URL, init: any) => {
        return new Promise<Response>((_resolve, reject) => {
          init.signal.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted', 'AbortError')),
          );
        });
      });

      const pending = proxyService.forwardRequest('sandbox-1', 80, 'health', 'GET', {}, null, res as any);
      await vi.advanceTimersByTimeAsync(2100); // past CONNECT_TIMEOUT_MS
      await pending;

      expect(mockSandboxService.exec).toHaveBeenCalled();
      expect(res.flushHeaders).not.toHaveBeenCalled();
    });

    it('terminates the connection on a mid-stream stall instead of retrying or erroring a fresh body', async () => {
      vi.useFakeTimers();
      const res = mockRes();

      global.fetch = vi.fn((_url: RequestInfo | URL, init: any) =>
        Promise.resolve({
          status: 200,
          headers: { forEach: (cb: any) => {} },
          body: new ReadableStream<Uint8Array>({
            start(controller) {
              // One chunk, then stall — never enqueues or closes again on its
              // own. Only the idle-timeout's abort (propagated the same way
              // real fetch/undici propagates it to an in-flight body reader)
              // should end this.
              controller.enqueue(new TextEncoder().encode('event: ping\n\n'));
              init.signal.addEventListener('abort', () => {
                controller.error(new DOMException('The operation was aborted', 'AbortError'));
              });
            },
          }),
        } as any),
      );

      const pending = proxyService.forwardRequest('sandbox-1', 80, 'health', 'GET', {}, null, res as any);
      await vi.advanceTimersByTimeAsync(61000); // past IDLE_TIMEOUT_MS
      await pending;

      expect(res.flushHeaders).toHaveBeenCalled();
      expect(res.write).toHaveBeenCalledTimes(1); // the one chunk it did get
      expect(res.end).toHaveBeenCalled();
      expect(mockSandboxService.exec).not.toHaveBeenCalled(); // no fallback once headers are committed
    });

    it('aborts the upstream fetch when the client disconnects mid-request', async () => {
      const res = mockRes();
      let closeHandler: (() => void) | undefined;
      res.on = vi.fn((event: string, cb: () => void) => {
        if (event === 'close') closeHandler = cb;
      });

      let capturedSignal: AbortSignal | undefined;
      global.fetch = vi.fn((_url: RequestInfo | URL, init: any) => {
        capturedSignal = init.signal;
        return new Promise<Response>((_resolve, reject) => {
          init.signal.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted', 'AbortError')),
          );
        });
      });

      const pending = proxyService.forwardRequest('sandbox-1', 80, 'health', 'GET', {}, null, res as any);
      // forwardRequest awaits sandboxService.findOne(...) before registering
      // the close listener, so give it one microtask tick to get there.
      await Promise.resolve();
      expect(closeHandler).toBeDefined();
      closeHandler!();
      await pending;

      expect(capturedSignal?.aborted).toBe(true);
    });
  });
});
