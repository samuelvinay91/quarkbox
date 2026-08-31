import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cluster, ClusterStatus, ClusterNodeConfig } from './cluster.entity';
import { SandboxService } from '../sandbox/sandbox.service';
import { TemplateService } from '../template/template.service';
import { ActivityService } from '../activity/activity.service';
import { ActivityType } from '../activity/activity.entity';
import Dockerode from 'dockerode';
import { ConfigService } from '@nestjs/config';

export interface CreateClusterDto {
  name: string;
  nodes: ClusterNodeConfig[];
  userId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class ClusterService {
  private readonly logger = new Logger(ClusterService.name);
  private readonly docker: Dockerode;

  constructor(
    @InjectRepository(Cluster)
    private readonly clusterRepo: Repository<Cluster>,
    @Inject(SandboxService)
    private readonly sandboxService: SandboxService,
    @Inject(TemplateService)
    private readonly templateService: TemplateService,
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
   * Spin up an entire multi-sandbox cluster topology atomically at once
   */
  async createCluster(dto: CreateClusterDto): Promise<{
    cluster: Cluster;
    sandboxes: any[];
  }> {
    if (!dto.nodes || dto.nodes.length === 0) {
      throw new BadRequestException('Cluster must contain at least 1 node definition');
    }

    const networkName = `qb-cluster-${dto.name.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now() % 10000}`;
    this.logger.log(`🌐 Creating private isolated network mesh '${networkName}' for cluster '${dto.name}'...`);

    // 1. Provision private cluster bridge network with internal DNS enabled
    try {
      await this.docker.createNetwork({
        Name: networkName,
        Driver: 'bridge',
        CheckDuplicate: true,
        Labels: {
          'quarkbox.cluster': dto.name,
          'quarkbox.managed': 'true',
        },
      });
    } catch (netErr: any) {
      this.logger.warn(`Network creation note: ${netErr.message}`);
    }

    // 2. Save initial cluster record
    const cluster = this.clusterRepo.create({
      name: dto.name,
      networkName,
      status: ClusterStatus.CREATING,
      nodes: dto.nodes,
      sandboxIds: [],
      userId: dto.userId,
      metadata: dto.metadata,
    });
    const savedCluster = await this.clusterRepo.save(cluster);

    const spawnedSandboxes: any[] = [];
    const sandboxIds: string[] = [];

    // 3. Spin up all cluster nodes in parallel
    try {
      const nodePromises = dto.nodes.map(async (node) => {
        let image = node.image || 'ubuntu:22.04';
        let defaultPorts = node.ports || {};
        let initialEnv = { ...(node.envVars || {}) };

        // If template slug provided, resolve image and default ports from Golden Marketplace
        if (node.templateSlug) {
          try {
            const tpl = await this.templateService.findOne(node.templateSlug);
            image = tpl.image;
            if (tpl.ports) {
              for (const p of tpl.ports) {
                defaultPorts[String(p.port)] = String(p.port);
              }
            }
          } catch (e: any) {
            this.logger.warn(`Could not resolve template ${node.templateSlug}: ${e.message}`);
          }
        }

        // Add cluster discovery environment variables
        initialEnv['CLUSTER_NAME'] = dto.name;
        initialEnv['NODE_NAME'] = node.name;
        initialEnv['CLUSTER_NETWORK'] = networkName;

        const sb = await this.sandboxService.create(
          {
            name: `${dto.name}-${node.name}`,
            image,
            cpuLimit: node.cpuLimit || 2,
            memoryLimit: node.memoryLimit || '1g',
            ports: defaultPorts,
            envVars: initialEnv,
            labels: {
              'quarkbox.cluster.id': savedCluster.id,
              'quarkbox.cluster.name': dto.name,
              'quarkbox.node.alias': node.networkAlias || node.name,
            },
          },
          dto.userId,
        );

        // Connect sandbox container to the private cluster network with DNS alias
        if (sb.containerId) {
          try {
            const network = this.docker.getNetwork(networkName);
            await network.connect({
              Container: sb.containerId,
              EndpointConfig: {
                Aliases: [node.networkAlias || node.name, node.name],
              },
            });
            this.logger.log(`🔗 Connected ${sb.name} (${sb.containerId.slice(0, 8)}) to ${networkName} as alias '${node.networkAlias || node.name}'`);
          } catch (connErr: any) {
            this.logger.warn(`Network connect note: ${connErr.message}`);
          }
        }

        return sb;
      });

      const results = await Promise.all(nodePromises);
      for (const sb of results) {
        spawnedSandboxes.push(sb);
        sandboxIds.push(sb.id);
      }

      savedCluster.sandboxIds = sandboxIds;
      savedCluster.status = ClusterStatus.RUNNING;
      await this.clusterRepo.save(savedCluster);

      await this.activityService.record({
        type: ActivityType.SANDBOX_CREATED,
        summary: `Spun up Cluster "${dto.name}" with ${spawnedSandboxes.length} nodes on network "${networkName}"`,
        userId: dto.userId,
        metadata: {
          clusterId: savedCluster.id,
          clusterName: dto.name,
          networkName,
          nodeCount: spawnedSandboxes.length,
          nodes: dto.nodes.map((n) => ({ name: n.name, alias: n.networkAlias, image: n.image })),
        },
      });

      return {
        cluster: savedCluster,
        sandboxes: spawnedSandboxes,
      };
    } catch (err: any) {
      savedCluster.status = ClusterStatus.ERROR;
      await this.clusterRepo.save(savedCluster);
      throw new BadRequestException(`Failed to spin up cluster mesh: ${err.message}`);
    }
  }

  /**
   * List all clusters
   */
  async findAll(): Promise<Cluster[]> {
    return this.clusterRepo.find({
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get single cluster details with active node statuses
   */
  async findOne(id: string): Promise<{ cluster: Cluster; sandboxes: any[] }> {
    const cluster = await this.clusterRepo.findOne({ where: { id } });
    if (!cluster) {
      throw new NotFoundException(`Cluster ${id} not found`);
    }

    const sandboxes: any[] = [];
    if (cluster.sandboxIds) {
      for (const sbId of cluster.sandboxIds) {
        try {
          const sb = await this.sandboxService.findOne(sbId);
          sandboxes.push(sb);
        } catch {
          // Ignore deleted sandboxes
        }
      }
    }

    return { cluster, sandboxes };
  }

  /**
   * Stop all nodes in a cluster
   */
  async stopCluster(id: string): Promise<Cluster> {
    const { cluster, sandboxes } = await this.findOne(id);
    for (const sb of sandboxes) {
      await this.sandboxService.stop(sb.id).catch(() => {});
    }
    cluster.status = ClusterStatus.STOPPED;
    return this.clusterRepo.save(cluster);
  }

  /**
   * Teardown and delete entire cluster mesh and network
   */
  async destroyCluster(id: string): Promise<void> {
    const { cluster, sandboxes } = await this.findOne(id);

    for (const sb of sandboxes) {
      await this.sandboxService.stop(sb.id).catch(() => {});
      await this.sandboxService.remove(sb.id).catch(() => {});
    }

    // Remove private bridge network
    try {
      const net = this.docker.getNetwork(cluster.networkName);
      await net.remove();
    } catch (e: any) {
      this.logger.warn(`Could not remove network ${cluster.networkName}: ${e.message}`);
    }

    await this.clusterRepo.remove(cluster);
    this.logger.log(`💥 Cluster ${cluster.name} destroyed.`);
  }
}
