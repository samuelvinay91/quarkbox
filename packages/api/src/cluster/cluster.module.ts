import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cluster } from './cluster.entity';
import { ClusterService } from './cluster.service';
import { ClusterController } from './cluster.controller';
import { SandboxModule } from '../sandbox/sandbox.module';
import { TemplateModule } from '../template/template.module';
import { ActivityModule } from '../activity/activity.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forFeature([Cluster]),
    SandboxModule,
    TemplateModule,
    ActivityModule,
    ConfigModule,
  ],
  providers: [ClusterService],
  controllers: [ClusterController],
  exports: [ClusterService],
})
export class ClusterModule {}
