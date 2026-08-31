import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { SandboxModule } from '../src/sandbox/sandbox.module';
import { Sandbox } from '../src/sandbox/sandbox.entity';
import { SnapshotModule } from '../src/snapshot/snapshot.module';
import { Snapshot } from '../src/snapshot/snapshot.entity';
import { ActivityModule } from '../src/activity/activity.module';
import { Activity } from '../src/activity/activity.entity';
import { MarketplaceTemplate } from '../src/template/template.entity';
import { Cluster } from '../src/cluster/cluster.entity';
import { ClusterModule } from '../src/cluster/cluster.module';
import { PoolModule } from '../src/pool/pool.module';
import { GovernorModule } from '../src/governor/governor.module';
import { ContextModule } from '../src/context/context.module';
import { DevcontainerModule } from '../src/devcontainer/devcontainer.module';
import { ProxyModule } from '../src/proxy/proxy.module';
import { TemplateModule } from '../src/template/template.module';
import { HealthModule } from '../src/health/health.module';
import { AuthModule } from '../src/auth/auth.module';
import { RuntimeModule } from '../src/runtime/runtime.module';

/**
 * Production-mode real server — uses actual DockerProvider
 * Connects to Docker Desktop via /var/run/docker.sock
 * Spins up real containers for each sandbox
 */
async function bootstrap() {
  const logger = new Logger('QuarkBoxRealServer');
  logger.log('Starting QuarkBox REAL Docker Server...');

  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        load: [
          () => ({
            NODE_ENV: 'development',
            PORT: 3001,
            SANDBOX_IDLE_TIMEOUT: 300,
            ENABLE_WARM_POOL: 'false', // Disable warm pool for real Docker to avoid auto-container creation
            DOCKER_SOCKET: '/var/run/docker.sock',
            SANDBOX_NETWORK: 'quarkbox-sandboxes',
          }),
        ],
      }),
      TypeOrmModule.forRoot({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: [Sandbox, Snapshot, Activity, MarketplaceTemplate, Cluster],
        synchronize: true,
        logging: false,
      }),
      RuntimeModule,
      HealthModule,
      AuthModule,
      ActivityModule,
      PoolModule,
      SandboxModule,
      ClusterModule,
      SnapshotModule,
      GovernorModule,
      ContextModule,
      DevcontainerModule,
      ProxyModule,
      TemplateModule,
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  app.enableCors();

  await app.listen(3001);
  logger.log('🚀 QuarkBox REAL Docker Server running at http://localhost:3001/api');
  logger.log('🐳 Connected to Docker Desktop — containers will be REAL');
}

bootstrap().catch((err) => {
  console.error('Failed to start real server:', err);
  process.exit(1);
});
