import { Module } from '@nestjs/common';
import { DeploymentAuditService } from './deployment-audit.service';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [ActivityModule],
  providers: [DeploymentAuditService],
  exports: [DeploymentAuditService],
})
export class DeploymentAuditModule {}
