import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sandbox, SandboxStatus } from './sandbox.entity';
import { CreateSandboxDto, UpdateSandboxDto } from './dto';
import { DockerProvider } from '../runtime/docker.provider';
import { FirecrackerProvider } from '../runtime/firecracker.provider';
import { ContainerdProvider } from '../runtime/containerd.provider';
import { RuntimeProvider } from '../runtime/runtime.interface';
import { ActivityService } from '../activity/activity.service';
import { ActivityType } from '../activity/activity.entity';
import { PoolService } from '../pool/pool.service';
import { WebhookService } from '../webhook/webhook.service';
import { validateCommand } from '../governor/security.service';
import { QuotaService } from '../plan/quota.service';
import { User } from '../user/user.entity';
import { Plan } from '../plan/plan.entity';
import { isUniqueConstraintViolation } from '../common/db-errors.util';

@Injectable()
export class SandboxService implements OnModuleInit {
  private readonly logger = new Logger(SandboxService.name);

  constructor(
    @InjectRepository(Sandbox)
    private readonly sandboxRepo: Repository<Sandbox>,
    @Inject(DockerProvider) private readonly dockerRuntime: DockerProvider,
    @Inject(FirecrackerProvider) private readonly firecrackerRuntime: FirecrackerProvider,
    @Inject(ContainerdProvider) private readonly containerdRuntime: ContainerdProvider,
    @Inject(ActivityService)
    private readonly activityService: ActivityService,
    @Inject(PoolService)
    private readonly poolService: PoolService,
    @Inject(WebhookService)
    private readonly webhookService: WebhookService,
    @Inject(QuotaService)
    private readonly quotaService: QuotaService,
  ) {}

  private getRuntime(runtimeType: string): RuntimeProvider {
    switch (runtimeType) {
      case 'firecracker':
        return this.firecrackerRuntime;
      case 'containerd':
        return this.containerdRuntime;
      case 'docker':
      default:
        return this.dockerRuntime;
    }
  }

  async onModuleInit() {
    try {
      const managed = await this.dockerRuntime.list({ 'quarkbox.managed': 'true' });
      this.logger.log(`🔍 Startup Reconciliation: Inspected ${managed.length} managed Docker containers`);
    } catch (e: any) {
      this.logger.debug(`Reconciliation scan: ${e.message}`);
    }
  }

  // ── CRUD ──────────────────────────────────────────────────────────

  async create(dto: CreateSandboxDto, userId?: string): Promise<Sandbox> {
    const startTime = Date.now();
    this.logger.log(`Creating sandbox: ${dto.name}`);

    let plan: Plan | null = null;
    if (userId) {
      const user = await this.sandboxRepo.manager
        .getRepository(User)
        .findOne({ where: { id: userId } });
      if (user) {
        plan = await this.quotaService.getPlanForUser(user);
        const check = await this.quotaService.checkCreateAllowed(userId, plan);
        if (!check.allowed) {
          throw new ForbiddenException('Plan limit reached: ' + check.reason);
        }
      }
    }

    const clamped = this.quotaService.validateResourceLimits(
      plan,
      dto.cpuLimit,
      dto.memoryLimit,
      dto.diskLimit,
    );

    // Create DB record
    const sandbox = this.sandboxRepo.create({
      name: dto.name,
      description: dto.description,
      image: dto.image || 'ubuntu:22.04',
      runtime: dto.runtime,
      cpuLimit: clamped.cpuLimit,
      memoryLimit: clamped.memoryLimit,
      diskLimit: clamped.diskLimit,
      ports: dto.ports || {},
      envVars: dto.envVars || {},
      labels: dto.labels || {},
      gpu: dto.gpu || false,
      status: SandboxStatus.CREATING,
      userId,
    });
    const saved = await this.sandboxRepo.save(sandbox);

    // Provision container (Check fast pre-warmed pool first)
    try {
      const runtimeProvider = this.getRuntime(saved.runtime);
      const coldProvision = () =>
        runtimeProvider.create({
          name: saved.id,
          image: saved.image,
          cpuLimit: saved.cpuLimit,
          memoryLimit: saved.memoryLimit,
          diskLimit: saved.diskLimit,
          ports: saved.ports,
          envVars: saved.envVars,
          gpu: saved.gpu,
          labels: {
            ...saved.labels,
            'quarkbox.sandbox.id': saved.id,
          },
        });

      let runtimeInfo = await this.poolService.claim(saved.image);
      let isWarmBoot = false;

      if (runtimeInfo) {
        isWarmBoot = true;
      } else {
        runtimeInfo = await coldProvision();
      }

      saved.containerId = runtimeInfo.id;
      saved.containerIp = runtimeInfo.ip;
      saved.status = SandboxStatus.RUNNING;
      saved.lastActiveAt = new Date();

      let result: Sandbox;
      try {
        result = await this.sandboxRepo.save(saved);
      } catch (saveErr) {
        if (!isWarmBoot || !isUniqueConstraintViolation(saveErr)) {
          throw saveErr;
        }
        // Lost a race for this warm container to another concurrent claim
        // (or a replica) between PoolService.claim()'s check and this save —
        // the `sandboxes.containerId` unique constraint caught it. Treat it
        // exactly like a pool-miss: clear the conflicting fields and cold-
        // provision instead, rather than failing the request.
        this.logger.warn(
          `Warm-pool container ${runtimeInfo.id.slice(0, 12)} was claimed concurrently; falling back to cold provision for sandbox "${saved.name}"`,
        );
        isWarmBoot = false;
        saved.containerId = undefined;
        saved.containerIp = undefined;

        runtimeInfo = await coldProvision();
        saved.containerId = runtimeInfo.id;
        saved.containerIp = runtimeInfo.ip;
        result = await this.sandboxRepo.save(saved);
      }

      const durationMs = Date.now() - startTime;

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

      this.webhookService.dispatch('sandbox.created', userId, { sandboxId: saved.id, name: saved.name, status: saved.status });

      if (userId) {
        await this.quotaService.incrementDailyUsage(userId);
      }

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

  async findAll(userId: string): Promise<Sandbox[]> {
    const where: Record<string, unknown> = { userId };
    return this.sandboxRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, userId?: string): Promise<Sandbox> {
    const where: Record<string, unknown> = { id };
    if (userId) where.userId = userId;
    const sandbox = await this.sandboxRepo.findOne({ where });
    if (!sandbox) {
      throw new NotFoundException(`Sandbox ${id} not found`);
    }
    return sandbox;
  }

  async update(id: string, dto: UpdateSandboxDto, userId?: string): Promise<Sandbox> {
    const sandbox = await this.findOne(id, userId);
    const before = {
      name: sandbox.name,
      image: sandbox.image,
      cpuLimit: sandbox.cpuLimit,
      memoryLimit: sandbox.memoryLimit,
      diskLimit: sandbox.diskLimit,
    };
    if (dto.name !== undefined) sandbox.name = dto.name;
    if (dto.image !== undefined) sandbox.image = dto.image;
    if (dto.cpuLimit !== undefined) sandbox.cpuLimit = dto.cpuLimit;
    if (dto.memoryLimit !== undefined) sandbox.memoryLimit = dto.memoryLimit;
    if (dto.diskLimit !== undefined) sandbox.diskLimit = dto.diskLimit;
    if (dto.envVars !== undefined) sandbox.envVars = dto.envVars;
    if (dto.ports !== undefined) sandbox.ports = dto.ports;
    if (dto.labels !== undefined) sandbox.labels = dto.labels;
    const result = await this.sandboxRepo.save(sandbox);
    await this.activityService.record({
      type: ActivityType.SANDBOX_CREATED,
      summary: `Sandbox "${result.name}" updated`,
      sandboxId: result.id,
      userId: userId || sandbox.userId,
      metadata: {
        action: 'update',
        changed: {
          name: before.name !== result.name ? result.name : undefined,
          image: before.image !== result.image ? result.image : undefined,
          cpuLimit: before.cpuLimit !== result.cpuLimit ? result.cpuLimit : undefined,
          memoryLimit: before.memoryLimit !== result.memoryLimit ? result.memoryLimit : undefined,
          diskLimit: before.diskLimit !== result.diskLimit ? result.diskLimit : undefined,
        },
      },
    });
    return result;
  }

  async remove(id: string, userId?: string): Promise<void> {
    const sandbox = await this.findOne(id, userId);

    sandbox.status = SandboxStatus.DELETING;
    await this.sandboxRepo.save(sandbox);

    // Remove container
    if (sandbox.containerId) {
      try {
        const runtimeProvider = this.getRuntime(sandbox.runtime);
        await runtimeProvider.remove(sandbox.containerId, true);
      } catch (error) {
        this.logger.warn(`Failed to remove container: ${error}`);
      }
    }

    await this.sandboxRepo.remove(sandbox);
    await this.activityService.record({
      type: ActivityType.SANDBOX_DELETED,
      summary: `Sandbox "${sandbox.name}" deleted`,
      sandboxId: sandbox.id,
      userId: userId || sandbox.userId,
      metadata: {
        action: 'delete',
        image: sandbox.image,
        runtime: sandbox.runtime,
      },
    });
    this.webhookService.dispatch('sandbox.deleted', sandbox.userId, { sandboxId: sandbox.id, name: sandbox.name });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────

  async start(id: string, userId?: string): Promise<Sandbox> {
    const sandbox = await this.findOne(id, userId);
    this.assertStatus(sandbox, [SandboxStatus.STOPPED, SandboxStatus.PAUSED]);

    if (sandbox.containerId) {
      const runtimeProvider = this.getRuntime(sandbox.runtime);
      await runtimeProvider.start(sandbox.containerId);
    }

    sandbox.status = SandboxStatus.RUNNING;
    sandbox.lastActiveAt = new Date();
    const result = await this.sandboxRepo.save(sandbox);
    await this.activityService.record({
      type: ActivityType.SANDBOX_STARTED,
      summary: `Sandbox "${sandbox.name}" started`,
      sandboxId: sandbox.id,
      userId: userId || sandbox.userId,
    });
    this.webhookService.dispatch('sandbox.started', sandbox.userId, { sandboxId: sandbox.id, name: sandbox.name, status: sandbox.status });
    return result;
  }

  async stop(id: string, userId?: string): Promise<Sandbox> {
    const sandbox = await this.findOne(id, userId);
    this.assertStatus(sandbox, [SandboxStatus.RUNNING, SandboxStatus.PAUSED]);

    if (sandbox.containerId) {
      const runtimeProvider = this.getRuntime(sandbox.runtime);
      await runtimeProvider.stop(sandbox.containerId);
    }

    sandbox.status = SandboxStatus.STOPPED;
    const result = await this.sandboxRepo.save(sandbox);
    await this.activityService.record({
      type: ActivityType.SANDBOX_STOPPED,
      summary: `Sandbox "${sandbox.name}" stopped`,
      sandboxId: sandbox.id,
      userId: userId || sandbox.userId,
    });
    this.webhookService.dispatch('sandbox.stopped', sandbox.userId, { sandboxId: sandbox.id, name: sandbox.name, status: sandbox.status });
    return result;
  }

  async pause(id: string, userId?: string): Promise<Sandbox> {
    const sandbox = await this.findOne(id, userId);
    this.assertStatus(sandbox, [SandboxStatus.RUNNING]);

    if (sandbox.containerId) {
      const runtimeProvider = this.getRuntime(sandbox.runtime);
      await runtimeProvider.pause(sandbox.containerId);
    }

    sandbox.status = SandboxStatus.PAUSED;
    const result = await this.sandboxRepo.save(sandbox);
    await this.activityService.record({
      type: ActivityType.SANDBOX_PAUSED,
      summary: `Sandbox "${sandbox.name}" paused`,
      sandboxId: sandbox.id,
      userId: userId || sandbox.userId,
    });
    return result;
  }

  async resume(id: string, userId?: string): Promise<Sandbox> {
    const sandbox = await this.findOne(id, userId);
    this.assertStatus(sandbox, [SandboxStatus.PAUSED]);

    if (sandbox.containerId) {
      const runtimeProvider = this.getRuntime(sandbox.runtime);
      await runtimeProvider.resume(sandbox.containerId);
    }

    sandbox.status = SandboxStatus.RUNNING;
    sandbox.lastActiveAt = new Date();
    const result = await this.sandboxRepo.save(sandbox);
    await this.activityService.record({
      type: ActivityType.SANDBOX_RESUMED,
      summary: `Sandbox "${sandbox.name}" resumed`,
      sandboxId: sandbox.id,
      userId: userId || sandbox.userId,
    });
    return result;
  }

  // ── Exec ──────────────────────────────────────────────────────────

  async exec(
    id: string,
    command: string,
    workdir?: string,
    userId?: string,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const sandbox = await this.findOne(id, userId);
    this.assertStatus(sandbox, [SandboxStatus.RUNNING]);

    if (!sandbox.containerId) {
      throw new BadRequestException('Sandbox has no container');
    }

    // ── Command Security Validation (defense-in-depth) ────────────────
    const scan = validateCommand(command);
    if (!scan.isSafe) {
      this.logger.warn(
        `🚨 Command blocked by security validation in sandbox ${sandbox.id}: ${scan.blockedReason}`,
      );
      throw new BadRequestException(
        `Command rejected by security policy: ${scan.blockedReason}`,
      );
    }

    // Update last active timestamp
    sandbox.lastActiveAt = new Date();
    await this.sandboxRepo.save(sandbox);

    const startTime = Date.now();
    const runtimeProvider = this.getRuntime(sandbox.runtime);
    const result = await runtimeProvider.exec({
      containerId: sandbox.containerId,
      command: ['sh', '-c', command],
      workdir: workdir || '/tmp',  // default to /tmp — always exists
    });
    const durationMs = Date.now() - startTime;

    const wasTruncated = result.truncated === true;

    await this.activityService.record({
      type: ActivityType.COMMAND_EXECUTED,
      summary: `Executed: ${command.substring(0, 100)}${command.length > 100 ? '...' : ''}`,
      sandboxId: sandbox.id,
      userId: userId || sandbox.userId,
      durationMs,
      isError: result.exitCode !== 0,
      metadata: {
        command,
        workdir,
        exitCode: result.exitCode,
        stdoutLength: result.stdout.length,
        stderrLength: result.stderr.length,
        truncated: wasTruncated,
        originalSizeBytes: result.originalSizeBytes,
      },
    });

    // SOC2 CC7.2: Record truncation as a separate audit event for visibility
    if (wasTruncated) {
      await this.activityService.record({
        type: ActivityType.EXEC_OUTPUT_TRUNCATED,
        summary: `Exec output truncated: ${result.originalSizeBytes} bytes exceeded 5MB cap`,
        sandboxId: sandbox.id,
        userId: userId || sandbox.userId,
        isError: false,
        metadata: {
          command: command.substring(0, 200),
          originalSizeBytes: result.originalSizeBytes,
          cappedAt: 5 * 1024 * 1024,
        },
      });
    }

    return result;
  }

  // ── Agent SDK ───────────────────────────────────────────────────────

  async runPython(
    id: string,
    code: string,
    userId?: string,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const sandbox = await this.findOne(id, userId);
    this.assertStatus(sandbox, [SandboxStatus.RUNNING]);

    if (!sandbox.containerId) {
      throw new BadRequestException('Sandbox has no container');
    }

    this.logger.log(`🐍 [Agent SDK] Executing native Python block in sandbox ${sandbox.id}`);

    // Base64 encode the code to avoid quote escaping issues in bash
    const b64Code = Buffer.from(code).toString('base64');
    const command = `echo "${b64Code}" | base64 -d > /tmp/agent_script.py && python3 /tmp/agent_script.py`;

    return this.exec(id, command, '/tmp');
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

  async getStats(id: string, userId?: string): Promise<import('../runtime/runtime.interface').ContainerStats> {
    const sandbox = await this.findOne(id, userId);
    this.assertStatus(sandbox, [SandboxStatus.RUNNING]);

    if (!sandbox.containerId) {
      throw new BadRequestException('Sandbox has no container');
    }

    const runtimeProvider = this.getRuntime(sandbox.runtime);
    return runtimeProvider.stats(sandbox.containerId);
  }
}
