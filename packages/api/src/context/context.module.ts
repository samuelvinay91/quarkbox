import { Module } from '@nestjs/common';
import { ContextService } from './context.service';
import { ContextController } from './context.controller';
import { SandboxModule } from '../sandbox/sandbox.module';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [SandboxModule, ActivityModule],
  providers: [ContextService],
  controllers: [ContextController],
  exports: [ContextService],
})
export class ContextModule {}
