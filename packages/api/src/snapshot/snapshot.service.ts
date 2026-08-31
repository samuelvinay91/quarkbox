import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Snapshot, SnapshotStatus } from './snapshot.entity';
import { Sandbox, SandboxStatus } from '../sandbox/sandbox.entity';
import { ActivityService } from '../activity/activity.service';
import { ActivityType } from '../activity/activity.entity';
import Dockerode from 'dockerode';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SnapshotService {
  private readonly logger = new Logger(SnapshotService.name);
  private readonly docker: Dockerode;

  constructor(
    @InjectRepository(Snapshot)
    private readonly snapshotRepo: Repository<Snapshot>,
    @InjectRepository(Sandbox)
    private readonly sandboxRepo: Repository<Sandbox>,
    @Inject(ActivityService)
    private readonly activityService: ActivityService,
    private readonly config?: ConfigService,
  ) {
    const socketPath =
      this.config?.get<string>('DOCKER_SOCKET') ||
      process.env.DOCKER_SOCKET ||
      '/var/run/docker.sock';
    this.docker = new Dockerode({ socketPath });
  }

  /**
   * Create a stateful snapshot (checkpoint) from a running or stopped sandbox
   */
  async createSnapshot(params: {
    sandboxId: string;
    name: string;
    description?: string;
    userId?: string;
  }): Promise<Snapshot> {
    const sandbox = await this.sandboxRepo.findOne({
      where: { id: params.sandboxId },
    });
    if (!sandbox) {
      throw new NotFoundException(`Sandbox ${params.sandboxId} not found`);
    }
    if (!sandbox.containerId) {
      throw new BadRequestException('Sandbox does not have an active container');
    }

    const snapshotTag = `quarkbox-snap-${sandbox.name.toLowerCase().replace(/[^a-z0-9]/g, '')}:${Date.now()}`;

    const snapshot = this.snapshotRepo.create({
      name: params.name,
      description: params.description,
      sandboxId: sandbox.id,
      snapshotImage: snapshotTag,
      status: SnapshotStatus.CREATING,
      userId: params.userId,
      metadata: {
        parentImage: sandbox.image,
        parentCpu: sandbox.cpuLimit,
        parentMemory: sandbox.memoryLimit,
      },
    });
    const saved = await this.snapshotRepo.save(snapshot);

    try {
      this.logger.log(
        `📸 Committing container ${sandbox.containerId.slice(0, 12)} to image ${snapshotTag}...`,
      );

      if (sandbox.containerId.startsWith('mock-')) {
        saved.sizeBytes = 10485760; // 10 MB simulated image
        saved.status = SnapshotStatus.READY;
      } else {
        const container = this.docker.getContainer(sandbox.containerId);
        const commitRes = await container.commit({
          repo: snapshotTag.split(':')[0],
          tag: snapshotTag.split(':')[1],
          comment: `QuarkBox Snapshot: ${params.name}`,
          author: 'QuarkBox Engine',
        });

        const imageInfo = await this.docker.getImage(commitRes.Id).inspect();
        saved.sizeBytes = imageInfo.Size || 0;
        saved.status = SnapshotStatus.READY;
      }
      const finalSnapshot = await this.snapshotRepo.save(saved);

      await this.activityService.record({
        type: ActivityType.SNAPSHOT_CREATED,
        summary: `Created snapshot "${params.name}" for sandbox "${sandbox.name}" (${Math.round((saved.sizeBytes / (1024 * 1024)) * 10) / 10}MB)`,
        sandboxId: sandbox.id,
        userId: params.userId,
        metadata: { snapshotId: saved.id, imageTag: snapshotTag },
      });

      return finalSnapshot;
    } catch (err: any) {
      saved.status = SnapshotStatus.ERROR;
      await this.snapshotRepo.save(saved);
      this.logger.error(`Snapshot failed: ${err.message}`);
      throw new BadRequestException(`Snapshot creation failed: ${err.message}`);
    }
  }

  /**
   * Fork a sandbox: creates a new sandbox cloned from the current state of an existing sandbox
   */
  async forkSandbox(
    sandboxId: string,
    forkName: string,
    userId?: string,
  ): Promise<Snapshot> {
    this.logger.log(`🍴 Forking sandbox ${sandboxId} into "${forkName}"...`);
    return this.createSnapshot({
      sandboxId,
      name: `Fork: ${forkName}`,
      description: `Instant clone generated from sandbox ${sandboxId}`,
      userId,
    });
  }

  /**
   * List all snapshots
   */
  async findAll(sandboxId?: string): Promise<Snapshot[]> {
    const where: Record<string, unknown> = {};
    if (sandboxId) where.sandboxId = sandboxId;
    return this.snapshotRepo.find({
      where,
      order: { createdAt: 'DESC' },
      relations: { sandbox: true },
    });
  }

  /**
   * Get single snapshot
   */
  async findOne(id: string): Promise<Snapshot> {
    const snapshot = await this.snapshotRepo.findOne({
      where: { id },
      relations: { sandbox: true },
    });
    if (!snapshot) {
      throw new NotFoundException(`Snapshot ${id} not found`);
    }
    return snapshot;
  }

  /**
   * Delete snapshot
   */
  async remove(id: string): Promise<void> {
    const snapshot = await this.findOne(id);
    try {
      if (snapshot.snapshotImage) {
        await this.docker.getImage(snapshot.snapshotImage).remove({ force: true });
      }
    } catch (e) {
      this.logger.warn(`Could not remove image ${snapshot.snapshotImage}: ${e}`);
    }
    await this.snapshotRepo.remove(snapshot);
  }
}
