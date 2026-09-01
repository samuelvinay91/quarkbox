import { DataSource, DataSourceOptions } from 'typeorm';
import { Sandbox } from './sandbox/sandbox.entity';
import { Snapshot } from './snapshot/snapshot.entity';
import { Activity } from './activity/activity.entity';
import { MarketplaceTemplate } from './template/template.entity';
import { Cluster } from './cluster/cluster.entity';
import { User } from './user/user.entity';
import { ApiKey } from './api-key/api-key.entity';
import { Webhook } from './webhook/webhook.entity';
import { RevokedToken } from './auth/revoked-token.entity';
import { Plan } from './plan/plan.entity';

const entities = [Sandbox, Snapshot, Activity, MarketplaceTemplate, Cluster, User, ApiKey, Webhook, RevokedToken, Plan];

function buildOptions(): DataSourceOptions {
  const dbHost = process.env.DATABASE_HOST;

  if (dbHost) {
    return {
      type: 'postgres',
      host: dbHost,
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
      username: process.env.POSTGRES_USER || 'quarkbox',
      password: process.env.DATABASE_PASSWORD,
      database: process.env.POSTGRES_DB || 'quarkbox',
      entities,
      migrations: ['src/migrations/*.ts'],
      ssl: process.env.DATABASE_SSL !== 'false'
        ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
        : false,
    };
  }

  return {
    type: 'better-sqlite3',
    database: 'quarkbox.db',
    entities,
    migrations: ['src/migrations/*.ts'],
  };
}

export default new DataSource(buildOptions());
