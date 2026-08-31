import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sandbox } from '../sandbox/sandbox.entity';
import { SandboxModule } from '../sandbox/sandbox.module';
import { ActivityModule } from '../activity/activity.module';
import { HibernationService } from './hibernation.service';
import { SecurityGovernanceService } from './security.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forFeature([Sandbox]),
    SandboxModule,
    ActivityModule,
    ConfigModule,
  ],
  providers: [HibernationService, SecurityGovernanceService],
  exports: [HibernationService, SecurityGovernanceService],
})
export class GovernorModule {}
