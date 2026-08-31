import { Module } from '@nestjs/common';
import { DevcontainerService } from './devcontainer.service';
import { DevcontainerController } from './devcontainer.controller';
import { SandboxModule } from '../sandbox/sandbox.module';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [SandboxModule, ActivityModule],
  providers: [DevcontainerService],
  controllers: [DevcontainerController],
  exports: [DevcontainerService],
})
export class DevcontainerModule {}
