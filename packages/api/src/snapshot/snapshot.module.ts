import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Snapshot } from './snapshot.entity';
import { SnapshotService } from './snapshot.service';
import { SnapshotController } from './snapshot.controller';
import { Sandbox } from '../sandbox/sandbox.entity';
import { ActivityModule } from '../activity/activity.module';
import { WebhookModule } from '../webhook/webhook.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forFeature([Snapshot, Sandbox]),
    ActivityModule,
    WebhookModule,
    ConfigModule,
  ],
  providers: [SnapshotService],
  controllers: [SnapshotController],
  exports: [SnapshotService],
})
export class SnapshotModule {}
