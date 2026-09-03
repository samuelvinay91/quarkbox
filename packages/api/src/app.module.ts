import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerGuard } from '@nestjs/throttler';
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
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { UserModule } from './user/user.module';
import { ApiKeyModule } from './api-key/api-key.module';
import { User } from './user/user.entity';
import { ApiKey } from './api-key/api-key.entity';
import { PlanModule } from './plan/plan.module';
import { Plan } from './plan/plan.entity';
import { Webhook } from './webhook/webhook.entity';
import { WebhookModule } from './webhook/webhook.module';
import { HttpLoggerModule } from './common/http-logger.module';
import { RevokedToken } from './auth/revoked-token.entity';
import { ScheduleModule } from '@nestjs/schedule';
import { RetentionModule } from './common/retention.module';
import { DeploymentAuditModule } from './common/deployment-audit.module';
import { AgentMemory } from './memory/memory.entity';
import { MemoryModule } from './memory/memory.module';
import { BrowserModule } from './browser/browser.module';

@Module({
  imports: [
    // Rate limiting
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),

    // Environment config
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),

    // Database — Postgres (production) or SQLite (local dev)
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): import('@nestjs/typeorm').TypeOrmModuleOptions => {
        const dbHost = config.get<string>('DATABASE_HOST');

        if (dbHost) {
          // Production: Postgres with TLS
          return {
            type: 'postgres',
            host: dbHost,
            port: config.get<number>('DATABASE_PORT', 5432),
            username: config.get<string>('POSTGRES_USER', 'quarkbox'),
            password: config.get<string>('DATABASE_PASSWORD'),
            database: config.get<string>('POSTGRES_DB', 'quarkbox'),
            entities: [Sandbox, Snapshot, Activity, MarketplaceTemplate, Cluster, User, ApiKey, Webhook, RevokedToken, Plan, AgentMemory],
            synchronize: process.env.NODE_ENV !== 'production',
            logging: config.get<string>('DATABASE_LOGGING', 'false') === 'true',
            ssl: config.get<string>('DATABASE_SSL', 'true') === 'true'
              ? { rejectUnauthorized: config.get<string>('DATABASE_SSL_REJECT_UNAUTHORIZED', 'true') === 'true' }
              : false,
          };
        }

        // Local development: SQLite
        return {
          type: 'better-sqlite3',
          database: 'quarkbox.db',
          entities: [Sandbox, Snapshot, Activity, MarketplaceTemplate, Cluster, User, ApiKey, Webhook, RevokedToken, Plan, AgentMemory],
          synchronize: process.env.NODE_ENV !== 'production',
          logging: false,
        };
      },
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
    UserModule,
    ApiKeyModule,
    WebhookModule,
    HttpLoggerModule,
    PlanModule,
    RetentionModule,
    DeploymentAuditModule,
    BrowserModule,
    MemoryModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
