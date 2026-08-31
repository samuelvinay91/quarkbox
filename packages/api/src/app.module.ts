import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SandboxModule } from './sandbox/sandbox.module';
import { Sandbox } from './sandbox/sandbox.entity';
import { Snapshot } from './snapshot/snapshot.entity';
import { Activity } from './activity/activity.entity';
import { MarketplaceTemplate } from './template/template.entity';
import { Cluster } from './cluster/cluster.entity';
import { ClusterModule } from './cluster/cluster.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { RuntimeModule } from './runtime/runtime.module';
import { ActivityModule } from './activity/activity.module';
import { TerminalModule } from './terminal/terminal.module';
import { TemplateModule } from './template/template.module';
import { PoolModule } from './pool/pool.module';
import { SnapshotModule } from './snapshot/snapshot.module';
import { GovernorModule } from './governor/governor.module';
import { ContextModule } from './context/context.module';
import { DevcontainerModule } from './devcontainer/devcontainer.module';
import { ProxyModule } from './proxy/proxy.module';

@Module({
  imports: [
    // Environment config
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): import('@nestjs/typeorm').TypeOrmModuleOptions => ({
        type: 'better-sqlite3',
        database: 'quarkbox.db',
        entities: [Sandbox, Snapshot, Activity, MarketplaceTemplate, Cluster],
        synchronize: true,
        logging: false,
      }),
    }),

    // Feature modules
    HealthModule,
    AuthModule,
    SandboxModule,
    ClusterModule,
    RuntimeModule,
    ActivityModule,
    TerminalModule,
    TemplateModule,
    PoolModule,
    SnapshotModule,
    GovernorModule,
    ContextModule,
    DevcontainerModule,
    ProxyModule,
  ],
})
export class AppModule {}
