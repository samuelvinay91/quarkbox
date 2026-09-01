import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ActivityService } from '../activity/activity.service';
import { ActivityType } from '../activity/activity.entity';
import * as fs from 'node:fs';
import * as os from 'node:os';

/**
 * Records deployment metadata on application startup.
 * SOC2 CC8.1 — Change Management: traces every deployment
 * from git commit through to running instance.
 *
 * Environment variables:
 *   DEPLOY_COMMIT_SHA    — Git commit hash of the deployed code
 *   DEPLOY_BRANCH        — Git branch name
 *   DEPLOY_TAG           — Release tag (e.g., v0.1.0)
 *   DEPLOY_ACTOR         — Who triggered the deployment
 *   DEPLOY_PIPELINE_URL  — CI/CD pipeline URL (e.g., GitHub Actions run URL)
 *   DEPLOY_ENVIRONMENT   — Deployment environment (e.g., production, staging)
 */
@Injectable()
export class DeploymentAuditService implements OnModuleInit {
  private readonly logger = new Logger(DeploymentAuditService.name);

  constructor(private readonly activityService: ActivityService) {}

  async onModuleInit() {
    try {
      await this.recordDeployment();
    } catch (err: any) {
      this.logger.warn(`Failed to record deployment event: ${err.message}`);
    }
  }

  private async recordDeployment() {
    const commitSha = process.env.DEPLOY_COMMIT_SHA || this.getLocalGitSha();
    const branch = process.env.DEPLOY_BRANCH || 'unknown';
    const tag = process.env.DEPLOY_TAG || '';
    const actor = process.env.DEPLOY_ACTOR || 'system';
    const pipelineUrl = process.env.DEPLOY_PIPELINE_URL || '';
    const environment = process.env.DEPLOY_ENVIRONMENT || process.env.NODE_ENV || 'development';

    await this.activityService.record({
      type: ActivityType.DEPLOYMENT_STARTED,
      summary: `Deployment started: ${commitSha?.substring(0, 8)} on ${environment}`,
      metadata: {
        commitSha,
        branch,
        tag,
        actor,
        pipelineUrl,
        environment,
        hostname: os.hostname(),
        nodeVersion: process.version,
        startedAt: new Date().toISOString(),
        pid: process.pid,
      },
    });

    this.logger.log(
      `📋 Deployment recorded: commit=${commitSha?.substring(0, 8)} env=${environment} actor=${actor}`,
    );
  }

  /**
   * Try to read git SHA from local .git directory (for local dev)
   */
  private getLocalGitSha(): string {
    try {
      const headRef = fs.readFileSync('.git/HEAD', 'utf-8').trim();
      if (headRef.startsWith('ref: ')) {
        const refPath = headRef.slice(5);
        return fs.readFileSync(`.git/${refPath}`, 'utf-8').trim().substring(0, 40);
      }
      return headRef.substring(0, 40);
    } catch {
      return 'unknown';
    }
  }
}
