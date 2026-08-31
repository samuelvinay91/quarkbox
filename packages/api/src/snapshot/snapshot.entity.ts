import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Sandbox } from '../sandbox/sandbox.entity';

export enum SnapshotStatus {
  CREATING = 'creating',
  READY = 'ready',
  RESTORING = 'restoring',
  ERROR = 'error',
}

@Entity('snapshots')
export class Snapshot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string;

  @Column({
    type: 'simple-enum',
    enum: SnapshotStatus,
    default: SnapshotStatus.CREATING,
  })
  @Index()
  status!: SnapshotStatus;

  @Column({ type: 'varchar', nullable: true })
  @Index()
  sandboxId?: string;

  @ManyToOne(() => Sandbox, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'sandboxId' })
  sandbox?: Sandbox;

  @Column({ type: 'varchar', length: 255 })
  snapshotImage!: string;

  @Column({ type: 'bigint', default: 0 })
  sizeBytes!: number;

  @Column({ type: 'simple-json', default: {} })
  metadata!: Record<string, unknown>;

  @Column({ type: 'varchar', nullable: true })
  userId?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
