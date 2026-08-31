import { Injectable, Logger } from '@nestjs/common';
import {
  RuntimeProvider,
  RuntimeInfo,
  RuntimeCreateOptions,
  ExecOptions,
  ExecResult,
} from './runtime.interface';

@Injectable()
export class MockRuntimeProvider implements RuntimeProvider {
  readonly name = 'mock';
  private readonly logger = new Logger(MockRuntimeProvider.name);
  private readonly containers = new Map<string, RuntimeInfo & { labels?: Record<string, string>; image?: string }>();
  private readonly filesystems = new Map<string, Map<string, string>>();

  async healthCheck(): Promise<boolean> {
    return true;
  }

  async pullImage(image: string): Promise<void> {
    this.logger.debug(`[MockRuntime] Simulated image pull for ${image}`);
  }

  async create(options: RuntimeCreateOptions): Promise<RuntimeInfo> {
    const id = `mock-${Math.random().toString(36).substring(2, 12)}`;
    const info: RuntimeInfo & { labels?: Record<string, string>; image?: string } = {
      id,
      status: 'running',
      ip: `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
      ports: options.ports,
      createdAt: new Date(),
      pid: Math.floor(Math.random() * 50000) + 1000,
      labels: options.labels,
      image: options.image,
    };

    this.containers.set(id, info);
    this.filesystems.set(id, new Map<string, string>());
    this.logger.debug(`[MockRuntime] Created simulated container ${id} (${options.image})`);
    return info;
  }

  async start(id: string): Promise<void> {
    const c = this.containers.get(id);
    if (c) c.status = 'running';
  }

  async stop(id: string, _timeout = 10): Promise<void> {
    const c = this.containers.get(id);
    if (c) c.status = 'stopped';
  }

  async pause(id: string): Promise<void> {
    const c = this.containers.get(id);
    if (c) c.status = 'paused';
  }

  async resume(id: string): Promise<void> {
    const c = this.containers.get(id);
    if (c) c.status = 'running';
  }

  async remove(id: string, _force = false): Promise<void> {
    this.containers.delete(id);
    this.filesystems.delete(id);
  }

  async inspect(id: string): Promise<RuntimeInfo | null> {
    return this.containers.get(id) || null;
  }

  async exec(options: ExecOptions): Promise<ExecResult> {
    const cmdStr = options.command.join(' ');
    const fs = this.filesystems.get(options.containerId) || new Map<string, string>();

    // Simulated file read
    if (cmdStr.includes('cat "')) {
      const match = cmdStr.match(/cat "([^"]+)"/);
      const filePath = match ? match[1] : '';
      const content = fs.get(filePath) || `Simulated content of ${filePath}\n`;
      return { exitCode: 0, stdout: content, stderr: '' };
    }

    // Simulated file write with printf or echo
    const writeMatch = cmdStr.match(/> "([^"]+)"/);
    if (writeMatch) {
      const filePath = writeMatch[1];
      fs.set(filePath, 'Written content');
      return { exitCode: 0, stdout: 'success\n', stderr: '' };
    }

    // Simulated echo
    const echoMatch = cmdStr.match(/echo "([^"]+)"/) || cmdStr.match(/echo '([^']+)'/);
    if (echoMatch) {
      return { exitCode: 0, stdout: `${echoMatch[1]}\n`, stderr: '' };
    }

    // Git clone / pull
    if (cmdStr.includes('git clone') || cmdStr.includes('git pull')) {
      return {
        exitCode: 0,
        stdout: 'Cloning into /workspace...\nremote: Enumerating objects: 42, done.\n',
        stderr: '',
      };
    }

    // ls -la
    if (cmdStr.includes('ls -la') || cmdStr.includes('ls ')) {
      return {
        exitCode: 0,
        stdout: 'total 12\ndrwxr-xr-x 2 root root 4096 Aug 31 16:00 .\ndrwxr-xr-x 3 root root 4096 Aug 31 16:00 ..\n-rw-r--r-- 1 root root  220 Aug 31 16:00 main.py\n',
        stderr: '',
      };
    }

    return {
      exitCode: 0,
      stdout: `[Simulated Output for: ${cmdStr}]\n`,
      stderr: '',
    };
  }

  async list(labels?: Record<string, string>): Promise<RuntimeInfo[]> {
    const list = Array.from(this.containers.values());
    if (!labels) return list;

    return list.filter((c) => {
      if (!c.labels) return false;
      for (const [k, v] of Object.entries(labels)) {
        if (c.labels[k] !== v) return false;
      }
      return true;
    });
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  async stats(containerId: string): Promise<import('./runtime.interface').ContainerStats> {
    // Return simulated but structurally accurate metrics
    const mem = 32 + Math.random() * 64;
    return {
      containerId,
      cpu: {
        usagePercent: Math.round(Math.random() * 5 * 100) / 100,
        systemCpuDelta: 1000000000,
        numCpus: 2,
      },
      memory: {
        usageMb: Math.round(mem * 100) / 100,
        limitMb: 512,
        usagePercent: Math.round((mem / 512) * 10000) / 100,
        cache: Math.round(Math.random() * 8192),
      },
      network: {
        rxBytes: Math.round(Math.random() * 65536),
        txBytes: Math.round(Math.random() * 32768),
        rxPackets: Math.round(Math.random() * 200),
        txPackets: Math.round(Math.random() * 100),
      },
      blockIO: {
        readBytes: Math.round(Math.random() * 1048576),
        writeBytes: Math.round(Math.random() * 524288),
      },
      pids: Math.floor(1 + Math.random() * 5),
      readAt: new Date().toISOString(),
    };
  }
}
