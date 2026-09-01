import { Controller, Get, Req, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { QuotaService } from './quota.service';
import { User } from '../user/user.entity';

@ApiTags('plan')
@ApiBearerAuth()
@Controller('plan')
export class PlanController {
  constructor(private readonly quotaService: QuotaService) {}

  @Get()
  async getPlan(@Req() req: Request): Promise<Record<string, unknown>> {
    const userId: string = (req.user as { userId: string }).userId;
    const userRepo = await this.quotaService.getSandboxRepoManager();
    const user: User | null = await userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new ForbiddenException('User not found');
    }
    const plan = await this.quotaService.getPlanForUser(user);
    const usage = await this.quotaService.getEmpiricalUsage(userId);
    const dailySandboxesUsed =
      user.dailyCountDate === this.todayString() ? user.dailySandboxCount : 0;

    return {
      name: plan.name,
      maxConcurrentSandboxes: plan.maxConcurrentSandboxes,
      maxSandboxesPerDay: plan.maxSandboxesPerDay,
      maxCpuPerSandbox: plan.maxCpuPerSandbox,
      maxMemoryPerSandbox: plan.maxMemoryPerSandbox,
      maxClusters: plan.maxClusters,
      maxDiskPerSandbox: plan.maxDiskPerSandbox,
      snapshotsEnabled: plan.snapshotsEnabled,
      usage: {
        activeSandboxes: usage.activeSandboxes,
        dailySandboxesUsed,
        activeClusters: usage.activeClusters,
      },
    };
  }

  private todayString(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
  }
}
