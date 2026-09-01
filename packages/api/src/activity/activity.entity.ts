import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Sandbox } from '../sandbox/sandbox.entity';

export enum ActivityType {
  SANDBOX_CREATED = 'sandbox.created',
  SANDBOX_STARTED = 'sandbox.started',
  SANDBOX_STOPPED = 'sandbox.stopped',
  SANDBOX_PAUSED = 'sandbox.paused',
  SANDBOX_RESUMED = 'sandbox.resumed',
  SANDBOX_DELETED = 'sandbox.deleted',
  SANDBOX_ERROR = 'sandbox.error',
  COMMAND_EXECUTED = 'command.executed',
  FILE_WRITTEN = 'file.written',
  FILE_READ = 'file.read',
  SNAPSHOT_CREATED = 'snapshot.created',
  SNAPSHOT_RESTORED = 'snapshot.restored',
  AUTH_LOGIN_SUCCESS = 'auth.login.success',
  AUTH_LOGIN_FAILED = 'auth.login.failed',
  AUTH_REGISTER = 'auth.register',
  AUTH_LOGOUT = 'auth.logout',
  AUTH_TOKEN_REVOKED = 'auth.token.revoked',
  API_KEY_CREATED = 'api_key.created',
  API_KEY_REVOKED = 'api_key.revoked',
  CLUSTER_CREATED = 'cluster.created',
  CLUSTER_DELETED = 'cluster.deleted',
  DEPLOYMENT_STARTED = 'deployment.started',
  DEPLOYMENT_COMPLETED = 'deployment.completed',
  DEPLOYMENT_FAILED = 'deployment.failed',
  CONFIG_CHANGED = 'config.changed',
  SCHEMA_MIGRATION_RUN = 'schema.migration.run',
  RETENTION_CLEANUP = 'retention.cleanup',
  EXEC_OUTPUT_TRUNCATED = 'exec.output.truncated',
}

@Entity('activities')
export class Activity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'simple-enum', enum: ActivityType })
  @Index()
  type!: ActivityType;

  @Column({ type: 'varchar', length: 500 })
  summary!: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;

  @Column({ type: 'varchar', nullable: true })
  @Index()
  sandboxId?: string;

  @ManyToOne(() => Sandbox, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'sandboxId' })
  sandbox?: Sandbox;

  @Column({ type: 'varchar', nullable: true })
  userId?: string;

  @Column({ type: 'varchar', nullable: true })
  source?: string;

  @Column({ type: 'int', nullable: true })
  durationMs?: number;

  @Column({ type: 'boolean', default: false })
  isError!: boolean;

  @Column({ type: 'varchar', length: 128, nullable: true })
  integrityHmac?: string;

  @CreateDateColumn()
  @Index()
  createdAt!: Date;
}
