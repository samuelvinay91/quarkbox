import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { SandboxService } from '../sandbox/sandbox.service';
import { ActivityService } from '../activity/activity.service';
import { ActivityType } from '../activity/activity.entity';
import { Sandbox } from '../sandbox/sandbox.entity';

export interface GitInjectionOptions {
  repoUrl: string;
  branch?: string;
  targetDir?: string;
  authToken?: string;
}

export interface SetupScriptOptions {
  script: string;
  workdir?: string;
}

@Injectable()
export class ContextService {
  private readonly logger = new Logger(ContextService.name);

  constructor(
    @Inject(SandboxService) private readonly sandboxService: SandboxService,
    @Inject(ActivityService) private readonly activityService: ActivityService,
  ) {}

  /**
   * Inject a Git repository directly into a running sandbox
   */
  async injectGitRepo(
    sandboxId: string,
    options: GitInjectionOptions,
  ): Promise<{ stdout: string; exitCode: number }> {
    const sandbox = await this.sandboxService.findOne(sandboxId);
    const targetDir = options.targetDir || '/workspace';
    const branchFlag = options.branch ? `-b ${options.branch}` : '';

    let cloneUrl = options.repoUrl;
    if (options.authToken && options.repoUrl.startsWith('https://')) {
      const urlWithoutScheme = options.repoUrl.replace('https://', '');
      cloneUrl = `https://oauth2:${options.authToken}@${urlWithoutScheme}`;
    }

    const command = `if ! command -v git >/dev/null 2>&1; then ` +
      `if command -v apt-get >/dev/null 2>&1; then apt-get update -qq && apt-get install -y -qq git; ` +
      `elif command -v apk >/dev/null 2>&1; then apk add --no-cache git; fi; fi && ` +
      `mkdir -p "${targetDir}" && cd "${targetDir}" && if [ ! -d .git ]; then git clone --depth 1 ${branchFlag} "${cloneUrl}" .; else git pull; fi`;

    this.logger.log(
      `Injecting Git repo ${options.repoUrl} into sandbox ${sandbox.name}...`,
    );

    const result = await this.sandboxService.exec(sandbox.id, command);

    await this.activityService.record({
      type: ActivityType.COMMAND_EXECUTED,
      summary: `Injected Git repository: ${options.repoUrl} (${options.branch || 'main'})`,
      sandboxId: sandbox.id,
      source: 'context-layer',
      isError: result.exitCode !== 0,
      metadata: {
        repoUrl: options.repoUrl,
        branch: options.branch,
        targetDir,
      },
    });

    const sanitizeOutput = (str: string) => {
      if (!str) return str;
      let sanitized = str;
      if (options.authToken) {
        sanitized = sanitized.replace(new RegExp(options.authToken, 'g'), '[REDACTED]');
      }
      return sanitized.replace(/oauth2:[^@]+@/g, 'oauth2:[REDACTED]@');
    };

    const cleanStdout = sanitizeOutput(result.stdout);
    const cleanStderr = sanitizeOutput(result.stderr);

    if (result.exitCode !== 0) {
      throw new BadRequestException(
        `Git clone failed: ${cleanStderr || cleanStdout}`,
      );
    }

    return { stdout: cleanStdout, exitCode: result.exitCode };
  }

  /**
   * Inject secrets and environment variables into sandbox files (.env)
   */
  async injectSecrets(
    sandboxId: string,
    secrets: Record<string, string>,
    filePath = '/workspace/.env',
  ): Promise<void> {
    const sandbox = await this.sandboxService.findOne(sandboxId);

    const lines = Object.entries(secrets).map(
      ([key, val]) => `${key}=${val}`,
    );
    const content = lines.join('\n');
    const escaped = content.replace(/'/g, "'\\''");

    const command = `mkdir -p "$(dirname "${filePath}")" && printf '%s\n' '${escaped}' > "${filePath}"`;
    await this.sandboxService.exec(sandbox.id, command);

    await this.activityService.record({
      type: ActivityType.FILE_WRITTEN,
      summary: `Injected ${Object.keys(secrets).length} environment secrets to ${filePath}`,
      sandboxId: sandbox.id,
      source: 'context-layer',
      metadata: { secretKeys: Object.keys(secrets), filePath },
    });
  }

  /**
   * Execute an onboarding / initialization setup script
   */
  async runSetupScript(
    sandboxId: string,
    options: SetupScriptOptions,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const sandbox = await this.sandboxService.findOne(sandboxId);
    return this.sandboxService.exec(
      sandbox.id,
      options.script,
      options.workdir || '/workspace',
    );
  }

  /**
   * 1-Click Sandbox Creation from Git Repository with automated onboarding
   */
  async createFromRepo(params: {
    name: string;
    repoUrl: string;
    branch?: string;
    image?: string;
    setupScript?: string;
    envVars?: Record<string, string>;
  }): Promise<Sandbox> {
    this.logger.log(`Creating context-aware sandbox from repo: ${params.repoUrl}`);

    // 1. Create sandbox
    const sandbox = await this.sandboxService.create({
      name: params.name,
      image: params.image || 'ubuntu:22.04',
      description: `Initialized from ${params.repoUrl}`,
    });

    // 2. Clone Git Repo
    await this.injectGitRepo(sandbox.id, {
      repoUrl: params.repoUrl,
      branch: params.branch,
      targetDir: '/workspace',
    });

    // 3. Inject secrets if any
    if (params.envVars && Object.keys(params.envVars).length > 0) {
      await this.injectSecrets(sandbox.id, params.envVars);
    }

    // 4. Run setup script if provided
    if (params.setupScript) {
      await this.runSetupScript(sandbox.id, {
        script: params.setupScript,
        workdir: '/workspace',
      });
    }

    return sandbox;
  }
}
