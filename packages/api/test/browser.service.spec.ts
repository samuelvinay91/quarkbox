import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException } from '@nestjs/common';
import { BrowserService } from '../src/browser/browser.service';
import { SandboxService } from '../src/sandbox/sandbox.service';
import { ActivityService } from '../src/activity/activity.service';

describe('BrowserService', () => {
  let service: BrowserService;

  const mockSandboxService = {
    exec: vi.fn(),
  };

  const mockActivityService = {
    record: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrowserService,
        { provide: SandboxService, useValue: mockSandboxService },
        { provide: ActivityService, useValue: mockActivityService },
      ],
    }).compile();

    service = module.get(BrowserService);

    // Default exec mock: playwright & port checks succeed (exitCode 0)
    mockSandboxService.exec.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({ success: true }),
      stderr: '',
    });
  });

  describe('navigate', () => {
    it('executes navigation script and returns page metadata', async () => {
      mockSandboxService.exec.mockImplementation(async (_id, cmd: string) => {
        if (cmd.includes('browser_script.js')) {
          return {
            exitCode: 0,
            stdout: JSON.stringify({ title: 'Example Domain', status: 200, url: 'https://example.com' }),
            stderr: '',
          };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      });

      const result = await service.navigate('sb-1', { url: 'https://example.com' }, 'user-1');

      expect(result.title).toBe('Example Domain');
      expect(result.status).toBe(200);
      expect(result.url).toBe('https://example.com');
      expect(mockActivityService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          sandboxId: 'sb-1',
          summary: 'Browser navigate executed',
        }),
      );
    });
  });

  describe('takeScreenshot', () => {
    it('executes screenshot script and returns base64 payload', async () => {
      mockSandboxService.exec.mockImplementation(async (_id, cmd: string) => {
        if (cmd.includes('browser_script.js')) {
          return {
            exitCode: 0,
            stdout: JSON.stringify({ base64: 'iVBORw0KGgoAAAANSUhEUg==', format: 'png' }),
            stderr: '',
          };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      });

      const result = await service.takeScreenshot('sb-1', { fullPage: true, format: 'png' }, 'user-1');

      expect(result.base64).toBe('iVBORw0KGgoAAAANSUhEUg==');
      expect(result.format).toBe('png');
      expect(mockActivityService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: 'Browser screenshot executed',
        }),
      );
    });
  });

  describe('click', () => {
    it('executes click command on specified element selector', async () => {
      mockSandboxService.exec.mockImplementation(async (_id, cmd: string) => {
        if (cmd.includes('browser_script.js')) {
          return {
            exitCode: 0,
            stdout: JSON.stringify({ success: true, url: 'https://example.com/clicked' }),
            stderr: '',
          };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      });

      const result = await service.click('sb-1', { selector: '#submit-btn' }, 'user-1');

      expect(result.success).toBe(true);
      expect(result.url).toBe('https://example.com/clicked');
      expect(mockActivityService.record).toHaveBeenCalled();
    });
  });

  describe('extractContent', () => {
    it('extracts text or HTML from targeted selector', async () => {
      mockSandboxService.exec.mockImplementation(async (_id, cmd: string) => {
        if (cmd.includes('browser_script.js')) {
          return {
            exitCode: 0,
            stdout: JSON.stringify({ content: '<h1>Welcome to QuarkBox</h1>' }),
            stderr: '',
          };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      });

      const result = await service.extractContent('sb-1', { selector: 'h1', format: 'html' });

      expect(result.content).toBe('<h1>Welcome to QuarkBox</h1>');
    });
  });

  describe('evaluate', () => {
    it('evaluates user-defined JavaScript expression', async () => {
      mockSandboxService.exec.mockImplementation(async (_id, cmd: string) => {
        if (cmd.includes('browser_script.js')) {
          return {
            exitCode: 0,
            stdout: JSON.stringify({ result: 42 }),
            stderr: '',
          };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      });

      const result = await service.evaluate('sb-1', { script: '6 * 7' });

      expect(result.result).toBe(42);
    });
  });

  describe('error handling', () => {
    it('throws InternalServerErrorException when browser script exits with non-zero code', async () => {
      mockSandboxService.exec.mockImplementation(async (_id, cmd: string) => {
        if (cmd.includes('browser_script.js')) {
          return { exitCode: 1, stdout: '', stderr: 'TimeoutError: page.goto timed out' };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      });

      await expect(
        service.navigate('sb-1', { url: 'https://unreachable.test' }),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('throws InternalServerErrorException when output is invalid JSON', async () => {
      mockSandboxService.exec.mockImplementation(async (_id, cmd: string) => {
        if (cmd.includes('browser_script.js')) {
          return { exitCode: 0, stdout: 'NOT_JSON_CRASHED', stderr: '' };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      });

      await expect(
        service.navigate('sb-1', { url: 'https://example.com' }),
      ).rejects.toThrow('Invalid output from browser script');
    });
  });
});
