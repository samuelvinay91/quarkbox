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
import { PoolModule } from '../src/pool/pool.module';
import { GovernorModule } from '../src/governor/governor.module';
import { ContextModule } from '../src/context/context.module';
import { DevcontainerModule } from '../src/devcontainer/devcontainer.module';
import { ProxyModule } from '../src/proxy/proxy.module';
import { TemplateModule } from '../src/template/template.module';
import { HealthModule } from '../src/health/health.module';
import { AuthModule } from '../src/auth/auth.module';
import { RUNTIME_PROVIDER } from '../src/runtime/runtime.interface';
import { MockRuntimeProvider } from '../src/runtime/mock.provider';

async function bootstrapTestServer() {
  const logger = new Logger('LiveIntegrationServer');
  logger.log('Starting QuarkBox Live Integration Test Server...');

  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        load: [
          () => ({
            NODE_ENV: 'test',
            PORT: 3000,
            SANDBOX_IDLE_TIMEOUT: 60,
            ENABLE_WARM_POOL: 'true',
          }),
        ],
      }),
      TypeOrmModule.forRoot({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: [Sandbox, Snapshot, Activity, MarketplaceTemplate],
        synchronize: true,
        logging: false,
      }),
      HealthModule,
      AuthModule,
      ActivityModule,
      PoolModule,
      SandboxModule,
      SnapshotModule,
      GovernorModule,
      ContextModule,
      DevcontainerModule,
      ProxyModule,
      TemplateModule,
    ],
  })
    .overrideProvider(RUNTIME_PROVIDER)
    .useClass(MockRuntimeProvider)
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  app.enableCors();

  await app.listen(3000);
  logger.log('✅ QuarkBox Live Integration Test Server is running at http://localhost:3000/api');
}

bootstrapTestServer().catch((err) => {
  console.error('Failed to start test server:', err);
  process.exit(1);
});
