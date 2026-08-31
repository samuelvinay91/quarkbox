import { Injectable, Logger, BadRequestException, Inject } from '@nestjs/common';
import { SandboxService } from '../sandbox/sandbox.service';
import { ActivityService } from '../activity/activity.service';
import { ActivityType } from '../activity/activity.entity';

export interface DevcontainerConfig {
  name?: string;
  image?: string;
  dockerFile?: string;
  build?: {
    dockerfile?: string;
    context?: string;
    args?: Record<string, string>;
  };
  features?: Record<string, Record<string, unknown>>;
  forwardPorts?: number[];
  portsAttributes?: Record<string, { label?: string; onAutoForward?: string }>;
  postCreateCommand?: string | string[] | Record<string, string>;
  postStartCommand?: string | string[] | Record<string, string>;
  remoteUser?: string;
  remoteEnv?: Record<string, string>;
  customizations?: {
    vscode?: {
      extensions?: string[];
      settings?: Record<string, unknown>;
    };
  };
}

@Injectable()
export class DevcontainerService {
  private readonly logger = new Logger(DevcontainerService.name);

  constructor(
    @Inject(SandboxService) private readonly sandboxService: SandboxService,
    @Inject(ActivityService) private readonly activityService: ActivityService,
  ) {}

  /**
   * Parse a devcontainer.json string or file content (supports comments and trailing commas)
   */
  parseConfig(content: string): DevcontainerConfig {
    try {
      // Strip comments (// and /* */) and trailing commas for JSON5 compliance
      const cleanJson = content
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*/g, '')
        .replace(/,\s*([\]}])/g, '$1');

      return JSON.parse(cleanJson) as DevcontainerConfig;
    } catch (err: any) {
      throw new BadRequestException(`Failed to parse devcontainer.json: ${err.message}`);
    }
  }

  /**
   * Detect and apply .devcontainer configuration in a running sandbox
   */
  async applyDevcontainer(sandboxId: string): Promise<{
    configFound: boolean;
    config?: DevcontainerConfig;
    appliedFeatures: string[];
    portsConfigured: number[];
  }> {
    const sandbox = await this.sandboxService.findOne(sandboxId);
    this.logger.log(`🔍 Scanning sandbox ${sandbox.name} for devcontainer configuration...`);

    // Check standard locations: .devcontainer/devcontainer.json or .devcontainer.json
    const checkRes = await this.sandboxService.exec(
      sandbox.id,
      'if [ -f .devcontainer/devcontainer.json ]; then cat .devcontainer/devcontainer.json; elif [ -f .devcontainer.json ]; then cat .devcontainer.json; else echo "__NOT_FOUND__"; fi',
      '/workspace',
    );

    if (checkRes.stdout.includes('__NOT_FOUND__') || checkRes.exitCode !== 0) {
      return { configFound: false, appliedFeatures: [], portsConfigured: [] };
    }

    const config = this.parseConfig(checkRes.stdout);
    const appliedFeatures: string[] = [];
    const portsConfigured: number[] = config.forwardPorts || [];

    // 1. Apply remote environment variables
    if (config.remoteEnv) {
      this.logger.log(`Injecting ${Object.keys(config.remoteEnv).length} remoteEnv variables...`);
      for (const [key, val] of Object.entries(config.remoteEnv)) {
        await this.sandboxService.exec(
          sandbox.id,
          `echo "export ${key}='${val}'" >> ~/.bashrc`,
        );
      }
    }

    // 2. Execute postCreateCommand
    if (config.postCreateCommand) {
      const cmd =
        typeof config.postCreateCommand === 'string'
          ? config.postCreateCommand
          : Array.isArray(config.postCreateCommand)
          ? config.postCreateCommand.join(' && ')
          : Object.values(config.postCreateCommand).join(' && ');

      this.logger.log(`⚡ Executing devcontainer postCreateCommand: ${cmd}`);
      await this.sandboxService.exec(sandbox.id, cmd, '/workspace');
    }

    await this.activityService.record({
      type: ActivityType.COMMAND_EXECUTED,
      summary: `Applied devcontainer.json configuration (${config.name || 'default'})`,
      sandboxId: sandbox.id,
      source: 'devcontainer',
      metadata: {
        forwardPorts: config.forwardPorts,
        extensions: config.customizations?.vscode?.extensions,
      },
    });

    return {
      configFound: true,
      config,
      appliedFeatures,
      portsConfigured,
    };
  }
}
