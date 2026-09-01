import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sandbox } from './sandbox.entity';
import { SandboxService } from './sandbox.service';
import { SandboxController } from './sandbox.controller';
import { RuntimeModule } from '../runtime/runtime.module';
import { ActivityModule } from '../activity/activity.module';
import { PoolModule } from '../pool/pool.module';
import { WebhookModule } from '../webhook/webhook.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Sandbox]),
    RuntimeModule,
    ActivityModule,
    PoolModule,
    WebhookModule,
  ],
  providers: [SandboxService],
  controllers: [SandboxController],
  exports: [SandboxService],
})
export class SandboxModule {}
