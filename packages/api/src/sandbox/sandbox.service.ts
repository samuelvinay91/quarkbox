import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sandbox, SandboxStatus } from './sandbox.entity';
import { CreateSandboxDto, UpdateSandboxDto } from './dto';
import {
  RuntimeProvider,
  RUNTIME_PROVIDER,
} from '../runtime/runtime.interface';
import { ActivityService } from '../activity/activity.service';
import { ActivityType } from '../activity/activity.entity';
import { PoolService } from '../pool/pool.service';

@Injectable()
export class SandboxService implements OnModuleInit {
  private readonly logger = new Logger(SandboxService.name);

  constructor(
    @InjectRepository(Sandbox)
    private readonly sandboxRepo: Repository<Sandbox>,
    @Inject(RUNTIME_PROVIDER)
    private readonly runtime: RuntimeProvider,
    @Inject(ActivityService)
    private readonly activityService: ActivityService,
    @Inject(PoolService)
    private readonly poolService: PoolService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const managed = await this.runtime.list({ 'quarkbox.managed': 'true' });
      this.logger.log(`🔍 Startup Reconciliation: Inspected ${managed.length} managed runtime containers`);
    } catch (e: any) {
      this.logger.debug(`Reconciliation scan: ${e.message}`);
    }
  }

  // ── CRUD ──────────────────────────────────────────────────────────

  async create(dto: CreateSandboxDto, userId?: string): Promise<Sandbox> {
    const startTime = Date.now();
    this.logger.log(`Creating sandbox: ${dto.name}`);

    // Create DB record
    const sandbox = this.sandboxRepo.create({
      name: dto.name,
      description: dto.description,
      image: dto.image || 'ubuntu:22.04',
      runtime: dto.runtime,
      cpuLimit: dto.cpuLimit || 1,
      memoryLimit: dto.memoryLimit || '512m',
      ports: dto.ports || {},
      envVars: dto.envVars || {},
      labels: dto.labels || {},
      status: SandboxStatus.CREATING,
      userId,
    });
    const saved = await this.sandboxRepo.save(sandbox);

    // Provision container (Check fast pre-warmed pool first)
    try {
      let runtimeInfo = await this.poolService.claim(saved.image);
      let isWarmBoot = false;

      if (runtimeInfo) {
        isWarmBoot = true;
      } else {
        runtimeInfo = await this.runtime.create({
          name: saved.id,
          image: saved.image,
          cpuLimit: saved.cpuLimit,
          memoryLimit: saved.memoryLimit,
          diskLimit: saved.diskLimit,
          ports: saved.ports,
          envVars: saved.envVars,
          labels: {
            ...saved.labels,
            'quarkbox.sandbox.id': saved.id,
          },
        });
      }

      const durationMs = Date.now() - startTime;
      saved.containerId = runtimeInfo.id;
      saved.containerIp = runtimeInfo.ip;
      saved.status = SandboxStatus.RUNNING;
      saved.lastActiveAt = new Date();
      const result = await this.sandboxRepo.save(saved);

      await this.activityService.record({
        type: ActivityType.SANDBOX_CREATED,
        summary: `Sandbox "${saved.name}" created (${saved.image}) ${isWarmBoot ? '⚡ [Warm Pool: ' + durationMs + 'ms]' : '🐢 [Cold Boot: ' + durationMs + 'ms]'}`,
        sandboxId: saved.id,
        userId,
        durationMs,
        metadata: {
          image: saved.image,
          cpuLimit: saved.cpuLimit,
          memoryLimit: saved.memoryLimit,
          warmBoot: isWarmBoot,
        },
      });

      return result;
    } catch (error) {
      saved.status = SandboxStatus.ERROR;
      await this.sandboxRepo.save(saved);
      await this.activityService.record({
        type: ActivityType.SANDBOX_ERROR,
        summary: `Failed to create sandbox "${saved.name}": ${error}`,
        sandboxId: saved.id,
        isError: true,
      });
      this.logger.error(`Failed to create sandbox: ${error}`);
      throw error;
    }
  }

  async findAll(userId?: string): Promise<Sandbox[]> {
    const where: Record<string, unknown> = {};
    if (userId) where.userId = userId;
    return this.sandboxRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Sandbox> {
    const sandbox = await this.sandboxRepo.findOne({ where: { id } });
    if (!sandbox) {
      throw new NotFoundException(`Sandbox ${id} not found`);
    }
    return sandbox;
  }

  async update(id: string, dto: UpdateSandboxDto): Promise<Sandbox> {
    const sandbox = await this.findOne(id);
    Object.assign(sandbox, dto);
    return this.sandboxRepo.save(sandbox);
  }

  async remove(id: string): Promise<void> {
    const sandbox = await this.findOne(id);

    sandbox.status = SandboxStatus.DELETING;
    await this.sandboxRepo.save(sandbox);

    // Remove container
    if (sandbox.containerId) {
      try {
        await this.runtime.remove(sandbox.containerId, true);
      } catch (error) {
        this.logger.warn(`Failed to remove container: ${error}`);
      }
    }

    await this.sandboxRepo.remove(sandbox);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────

  async start(id: string): Promise<Sandbox> {
    const sandbox = await this.findOne(id);
    this.assertStatus(sandbox, [SandboxStatus.STOPPED, SandboxStatus.PAUSED]);

    if (sandbox.containerId) {
      await this.runtime.start(sandbox.containerId);
    }

    sandbox.status = SandboxStatus.RUNNING;
    sandbox.lastActiveAt = new Date();
    const result = await this.sandboxRepo.save(sandbox);
    await this.activityService.record({
      type: ActivityType.SANDBOX_STARTED,
      summary: `Sandbox "${sandbox.name}" started`,
      sandboxId: sandbox.id,
    });
    return result;
  }

  async stop(id: string): Promise<Sandbox> {
    const sandbox = await this.findOne(id);
    this.assertStatus(sandbox, [SandboxStatus.RUNNING, SandboxStatus.PAUSED]);

    if (sandbox.containerId) {
      await this.runtime.stop(sandbox.containerId);
    }

    sandbox.status = SandboxStatus.STOPPED;
    const result = await this.sandboxRepo.save(sandbox);
    await this.activityService.record({
      type: ActivityType.SANDBOX_STOPPED,
      summary: `Sandbox "${sandbox.name}" stopped`,
      sandboxId: sandbox.id,
    });
    return result;
  }

  async pause(id: string): Promise<Sandbox> {
    const sandbox = await this.findOne(id);
    this.assertStatus(sandbox, [SandboxStatus.RUNNING]);

    if (sandbox.containerId) {
      await this.runtime.pause(sandbox.containerId);
    }

    sandbox.status = SandboxStatus.PAUSED;
    return this.sandboxRepo.save(sandbox);
  }

  async resume(id: string): Promise<Sandbox> {
    const sandbox = await this.findOne(id);
    this.assertStatus(sandbox, [SandboxStatus.PAUSED]);

    if (sandbox.containerId) {
      await this.runtime.resume(sandbox.containerId);
    }

    sandbox.status = SandboxStatus.RUNNING;
    sandbox.lastActiveAt = new Date();
    return this.sandboxRepo.save(sandbox);
  }

  // ── Exec ──────────────────────────────────────────────────────────

  async exec(
    id: string,
    command: string,
    workdir?: string,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const sandbox = await this.findOne(id);
    this.assertStatus(sandbox, [SandboxStatus.RUNNING]);

    if (!sandbox.containerId) {
      throw new BadRequestException('Sandbox has no container');
    }

    // ── Enterprise Security & Cloud Metadata Shield ───────────────────
    const metadataBlocklist = [
      /169\.254\.169\.254/i,
      /metadata\.google\.internal/i,
      /100\.100\.100\.200/i,
      /\/latest\/meta-data/i,
    ];
    for (const pattern of metadataBlocklist) {
      if (pattern.test(command)) {
        await this.activityService.record({
          type: ActivityType.SANDBOX_ERROR,
          summary: `🚨 Cloud Metadata Exfiltration Attempt Blocked: ${command.slice(0, 80)}`,
          sandboxId: sandbox.id,
          isError: true,
        });
        throw new BadRequestException(`Security Policy Violation: Cloud metadata service access (169.254.169.254) is blocked.`);
      }
    }

    // Update last active timestamp
    sandbox.lastActiveAt = new Date();
    await this.sandboxRepo.save(sandbox);

    const startTime = Date.now();
    const result = await this.runtime.exec({
      containerId: sandbox.containerId,
      command: ['sh', '-c', command],
      workdir: workdir || '/tmp',  // default to /tmp — always exists
    });
    const durationMs = Date.now() - startTime;

    await this.activityService.record({
      type: ActivityType.COMMAND_EXECUTED,
      summary: `Executed: ${command.substring(0, 100)}${command.length > 100 ? '...' : ''}`,
      sandboxId: sandbox.id,
      durationMs,
      isError: result.exitCode !== 0,
      metadata: {
        command,
        workdir,
        exitCode: result.exitCode,
        stdoutLength: result.stdout.length,
        stderrLength: result.stderr.length,
      },
    });

    return result;
  }

  // ── Helpers ───────────────────────────────────────────────────────

  private assertStatus(sandbox: Sandbox, allowed: SandboxStatus[]): void {
    if (!allowed.includes(sandbox.status)) {
      throw new BadRequestException(
        `Cannot perform this action on sandbox in '${sandbox.status}' state. ` +
          `Allowed states: ${allowed.join(', ')}`,
      );
    }
  }

  // ── Metrics ───────────────────────────────────────────────────────

  async getStats(id: string): Promise<import('../runtime/runtime.interface').ContainerStats> {
    const sandbox = await this.findOne(id);
    this.assertStatus(sandbox, [SandboxStatus.RUNNING]);

    if (!sandbox.containerId) {
      throw new BadRequestException('Sandbox has no container');
    }

    return this.runtime.stats(sandbox.containerId);
  }
}
