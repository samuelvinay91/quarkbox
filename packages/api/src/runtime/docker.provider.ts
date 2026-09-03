import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Dockerode from 'dockerode';
import { PassThrough } from 'stream';
import {
  RuntimeProvider,
  RuntimeInfo,
  RuntimeCreateOptions,
  ExecOptions,
  ExecResult,
} from './runtime.interface';

@Injectable()
export class DockerProvider implements RuntimeProvider, OnModuleInit {
  readonly name = 'docker';
  private readonly docker: Dockerode;
  private readonly logger = new Logger(DockerProvider.name);

  constructor(private readonly config?: ConfigService) {
    const socketPath =
      this.config?.get<string>('DOCKER_SOCKET') ||
      process.env.DOCKER_SOCKET ||
      '/var/run/docker.sock';
    this.docker = new Dockerode({ socketPath });
  }

  async onModuleInit(): Promise<void> {
    const healthy = await this.healthCheck();
    if (healthy) {
      this.logger.log('✅ Docker runtime connected');
      // Ensure sandbox network exists
      await this.ensureNetwork();
    } else {
      this.logger.warn(
        '⚠️  Docker runtime not available — sandbox operations will fail',
      );
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch {
      return false;
    }
  }

  async pullImage(image: string): Promise<void> {
    this.logger.log(`Pulling image: ${image}`);
    const stream = await this.docker.pull(image);
    // Wait for pull to complete
    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(
        stream,
        (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        },
      );
    });
    this.logger.log(`Image pulled: ${image}`);
  }

  async create(options: RuntimeCreateOptions): Promise<RuntimeInfo> {
    // Ensure image is available
    try {
      await this.docker.getImage(options.image).inspect();
    } catch {
      await this.pullImage(options.image);
    }

    const networkName =
      options.network ||
      this.config?.get<string>('SANDBOX_NETWORK') ||
      process.env.SANDBOX_NETWORK ||
      'quarkbox-sandboxes';

    // Build port bindings
    const exposedPorts: Record<string, object> = {};
    const portBindings: Record<string, Array<{ HostPort: string }>> = {};
    if (options.ports) {
      const portEntries = Object.entries(options.ports);
      if (portEntries.length > 10) {
        throw new Error('Maximum 10 port mappings allowed per sandbox');
      }
      for (const [containerPort, hostPort] of portEntries) {
        const containerPortNum = parseInt(containerPort, 10);
        const hostPortNum = parseInt(hostPort, 10);
        if (
          isNaN(containerPortNum) || containerPortNum < 1 || containerPortNum > 65535 ||
          isNaN(hostPortNum) || hostPortNum < 1 || hostPortNum > 65535
        ) {
          throw new Error(`Invalid port mapping: ${containerPort} -> ${hostPort}. Ports must be between 1 and 65535.`);
        }
        const portKey = `${containerPort}/tcp`;
        exposedPorts[portKey] = {};
        portBindings[portKey] = [{ HostPort: hostPort }];
      }
    }

    // Build env array
    const env: string[] = [];
    if (options.envVars) {
      for (const [key, value] of Object.entries(options.envVars)) {
        env.push(`${key}=${value}`);
      }
    }

    // Build labels
    const labels: Record<string, string> = {
      'quarkbox.managed': 'true',
      'quarkbox.sandbox.name': options.name,
      ...options.labels,
    };

    // Parse memory limit to bytes
    const memoryBytes = this.parseMemory(options.memoryLimit);

    const deviceRequests = [];
    if (options.gpu) {
      const gpuOpts = typeof options.gpu === 'object' ? options.gpu : {} as any;
      deviceRequests.push({
        Driver: 'nvidia',
        Count: gpuOpts.count !== undefined ? gpuOpts.count : -1,
        Capabilities: gpuOpts.capabilities ? gpuOpts.capabilities : [['gpu']],
      });
    }

    // Create container
    const container = await this.docker.createContainer({
      name: `quarkbox-${options.name}`,
      Image: options.image,
      Cmd: options.command || ['sh', '-c', 'tail -f /dev/null'],
      ExposedPorts: exposedPorts,
      Env: env,
      Labels: labels,
      HostConfig: {
        PortBindings: portBindings,
        NetworkMode: networkName,
        CpuCount: options.cpuLimit,
        Memory: memoryBytes,
        MemorySwap: memoryBytes,
        PidsLimit: 256,
        ReadonlyRootfs: false,
        StorageOpt: { size: options.diskLimit || '10g' },
        RestartPolicy: { Name: 'unless-stopped' },
        SecurityOpt: ['no-new-privileges:true'],
        CapDrop: ['ALL'],
        ExtraHosts: [
          '169.254.169.254:0.0.0.0', // AWS/GCP Metadata IPv4
          'metadata.google.internal:0.0.0.0', // GCP Metadata Domain
          '100.100.100.200:0.0.0.0', // Alibaba Cloud Metadata
        ],
        DeviceRequests: deviceRequests.length > 0 ? deviceRequests : undefined,
      },
      Tty: true,
      OpenStdin: true,
    });

    // Start the container
    await container.start();

    // Get info
    const info = await container.inspect();

    return {
      id: info.Id,
      status: 'running',
      ip: info.NetworkSettings?.Networks?.[networkName]?.IPAddress || undefined,
      ports: options.ports,
      createdAt: new Date(info.Created),
      pid: info.State?.Pid || undefined,
    };
  }

  async start(id: string): Promise<void> {
    const container = this.docker.getContainer(id);
    await container.start();
  }

  async stop(id: string, timeout = 10): Promise<void> {
    const container = this.docker.getContainer(id);
    await container.stop({ t: timeout });
  }

  async pause(id: string): Promise<void> {
    const container = this.docker.getContainer(id);
    await container.pause();
  }

  async resume(id: string): Promise<void> {
    const container = this.docker.getContainer(id);
    await container.unpause();
  }

  async remove(id: string, force = false): Promise<void> {
    const container = this.docker.getContainer(id);
    await container.remove({ force, v: true });
  }

  async inspect(id: string): Promise<RuntimeInfo | null> {
    try {
      const container = this.docker.getContainer(id);
      const info = await container.inspect();

      let status: RuntimeInfo['status'] = 'unknown';
      if (info.State?.Running) status = 'running';
      else if (info.State?.Paused) status = 'paused';
      else if (info.State?.Status === 'created') status = 'created';
      else status = 'stopped';

      return {
        id: info.Id,
        status,
        ip: this.extractIp(info),
        createdAt: new Date(info.Created),
        pid: info.State?.Pid || undefined,
      };
    } catch {
      return null;
    }
  }

  async exec(options: ExecOptions): Promise<ExecResult> {
    const container = this.docker.getContainer(options.containerId);

    const env: string[] = [];
    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        env.push(`${key}=${value}`);
      }
    }

    const exec = await container.exec({
      Cmd: options.command,
      WorkingDir: options.workdir || '/workspace',
      Env: env,
      AttachStdout: true,
      AttachStderr: true,
      Tty: options.tty || false,
    });

    const stream = await exec.start({ Detach: false, Tty: false });

    // Collect output with max buffer cap to prevent OOM
    const MAX_OUTPUT_BYTES = 5 * 1024 * 1024; // 5 MB cap
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let totalStdoutBytes = 0;
    let totalStderrBytes = 0;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    const timeoutMs = 120000; // 2 minutes default execution timeout

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        try {
          (stream as any).destroy?.();
        } catch {}
        resolve(); // resolve on timeout with partial logs
      }, timeoutMs);

      const stdoutStream = new PassThrough();
      const stderrStream = new PassThrough();

      stdoutStream.on('data', (chunk: Buffer) => {
        totalStdoutBytes += chunk.length;
        if (stdoutBytes < MAX_OUTPUT_BYTES) {
          stdout.push(chunk);
          stdoutBytes += chunk.length;
        } else {
          stdoutTruncated = true;
        }
      });

      stderrStream.on('data', (chunk: Buffer) => {
        totalStderrBytes += chunk.length;
        if (stderrBytes < MAX_OUTPUT_BYTES) {
          stderr.push(chunk);
          stderrBytes += chunk.length;
        } else {
          stderrTruncated = true;
        }
      });

      this.docker.modem.demuxStream(stream, stdoutStream, stderrStream);

      stream.on('end', () => {
        clearTimeout(timer);
        resolve();
      });

      stream.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    const execInspect = await exec.inspect();

    const truncated = stdoutTruncated || stderrTruncated;
    return {
      exitCode: execInspect.ExitCode ?? -1,
      stdout: Buffer.concat(stdout).toString('utf-8'),
      stderr: Buffer.concat(stderr).toString('utf-8'),
      truncated,
      originalSizeBytes: truncated ? totalStdoutBytes + totalStderrBytes : undefined,
    };
  }

  async list(labels?: Record<string, string>): Promise<RuntimeInfo[]> {
    const filters: Record<string, string[]> = {
      label: ['quarkbox.managed=true'],
    };

    if (labels) {
      for (const [key, value] of Object.entries(labels)) {
        filters.label.push(`${key}=${value}`);
      }
    }

    const containers = await this.docker.listContainers({
      all: true,
      filters,
    });

    return containers.map((c) => {
      const networks = c.NetworkSettings?.Networks;
      const firstNet = networks ? Object.values(networks)[0] : undefined;
      const ip = firstNet?.IPAddress || undefined;

      return {
        id: c.Id,
        status: this.mapDockerState(c.State),
        ip,
        ports: this.extractPortsFromList(c.Ports),
        createdAt: new Date(c.Created * 1000),
      };
    });
  }

  // ── Private Helpers ────────────────────────────────────────────────

  private async ensureNetwork(): Promise<void> {
    const networkName =
      this.config?.get<string>('SANDBOX_NETWORK') ||
      process.env.SANDBOX_NETWORK ||
      'quarkbox-sandboxes';
    try {
      await this.docker.getNetwork(networkName).inspect();
    } catch {
      this.logger.log(`Creating Docker network: ${networkName}`);
      await this.docker.createNetwork({
        Name: networkName,
        Driver: 'bridge',
        Labels: { 'quarkbox.managed': 'true' },
      });
    }
  }

  private parseMemory(limit: string): number {
    const match = limit.match(/^(\d+)([mg])$/i);
    if (!match) return 512 * 1024 * 1024; // default 512MB
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    return unit === 'g' ? value * 1024 * 1024 * 1024 : value * 1024 * 1024;
  }

  private extractIp(info: Dockerode.ContainerInspectInfo): string | undefined {
    const networks = info.NetworkSettings?.Networks;
    if (!networks) return undefined;
    const firstNetwork = Object.values(networks)[0];
    return firstNetwork?.IPAddress || undefined;
  }

  private mapDockerState(state: string): RuntimeInfo['status'] {
    switch (state) {
      case 'running':
        return 'running';
      case 'paused':
        return 'paused';
      case 'created':
        return 'created';
      case 'exited':
      case 'dead':
        return 'stopped';
      default:
        return 'unknown';
    }
  }

  private extractPortsFromList(
    ports: Dockerode.Port[] | undefined | null,
  ): Record<string, string> {
    const result: Record<string, string> = {};
    if (!ports) return result;
    for (const port of ports) {
      if (port.PublicPort) {
        result[String(port.PrivatePort)] = String(port.PublicPort);
      }
    }
    return result;
  }

  // ── Real Container Metrics (Docker Stats API → cgroups) ────────────

  async stats(containerId: string): Promise<import('./runtime.interface').ContainerStats> {
    const container = this.docker.getContainer(containerId);

    return new Promise((resolve, reject) => {
      container.stats({ stream: false }, (err: Error | null, data: any) => {
        if (err) return reject(err);
        if (!data) return reject(new Error('No stats returned'));

        try {
          const stat = typeof data === 'string' ? JSON.parse(data) : data;

          // ── CPU ──
          const cpuDelta = stat.cpu_stats.cpu_usage.total_usage - stat.precpu_stats.cpu_usage.total_usage;
          const systemDelta = stat.cpu_stats.system_cpu_usage - stat.precpu_stats.system_cpu_usage;
          const numCpus = stat.cpu_stats.online_cpus || stat.cpu_stats.cpu_usage.percpu_usage?.length || 1;
          const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * numCpus * 100 : 0;

          // ── Memory ──
          const memUsage = stat.memory_stats.usage || 0;
          const memCache = stat.memory_stats.stats?.cache || stat.memory_stats.stats?.inactive_file || 0;
          const memUsageReal = memUsage - memCache;
          const memLimit = stat.memory_stats.limit || 1;
          const memUsageMb = memUsageReal / (1024 * 1024);
          const memLimitMb = memLimit / (1024 * 1024);

          // ── Network ──
          const networks = stat.networks || {};
          let rxBytes = 0, txBytes = 0, rxPackets = 0, txPackets = 0;
          for (const net of Object.values(networks) as any[]) {
            rxBytes += net.rx_bytes || 0;
            txBytes += net.tx_bytes || 0;
            rxPackets += net.rx_packets || 0;
            txPackets += net.tx_packets || 0;
          }

          // ── Block I/O ──
          const blkioStats = stat.blkio_stats?.io_service_bytes_recursive || [];
          let readBytes = 0, writeBytes = 0;
          for (const entry of blkioStats) {
            if (entry.op === 'read') readBytes += entry.value;
            else if (entry.op === 'write') writeBytes += entry.value;
          }

          resolve({
            containerId,
            cpu: {
              usagePercent: Math.round(cpuPercent * 100) / 100,
              systemCpuDelta: systemDelta,
              numCpus,
            },
            memory: {
              usageMb: Math.round(memUsageMb * 100) / 100,
              limitMb: Math.round(memLimitMb * 100) / 100,
              usagePercent: Math.round((memUsageReal / memLimit) * 10000) / 100,
              cache: Math.round(memCache / 1024),
            },
            network: { rxBytes, txBytes, rxPackets, txPackets },
            blockIO: { readBytes, writeBytes },
            pids: stat.pids_stats?.current || 0,
            readAt: stat.read,
          });
        } catch (e) {
          reject(e);
        }
      });
    });
  }
}
