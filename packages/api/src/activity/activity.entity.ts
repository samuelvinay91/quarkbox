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

  @CreateDateColumn()
  @Index()
  createdAt!: Date;
}
