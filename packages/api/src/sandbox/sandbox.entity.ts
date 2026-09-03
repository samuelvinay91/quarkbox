import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum SandboxStatus {
  CREATING = 'creating',
  RUNNING = 'running',
  PAUSED = 'paused',
  STOPPED = 'stopped',
  ERROR = 'error',
  DELETING = 'deleting',
}

export enum SandboxRuntime {
  DOCKER = 'docker',
  CONTAINERD = 'containerd',
  FIRECRACKER = 'firecracker',
}

@Entity('sandboxes')
export class Sandbox {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string;

  @Column({
    type: 'simple-enum',
    enum: SandboxStatus,
    default: SandboxStatus.CREATING,
  })
  @Index()
  status!: SandboxStatus;

  @Column({
    type: 'simple-enum',
    enum: SandboxRuntime,
    default: SandboxRuntime.DOCKER,
  })
  runtime!: SandboxRuntime;

  @Column({ type: 'varchar', length: 255, default: 'ubuntu:22.04' })
  image!: string;

  // Unique so a warm-pool container can never be adopted by two Sandbox rows —
  // ANSI SQL treats NULL as distinct from NULL, so this stays permissive for
  // sandboxes that haven't been provisioned yet.
  @Column({ type: 'varchar', nullable: true })
  @Index('IDX_sandbox_containerId_unique', { unique: true })
  containerId?: string;

  @Column({ type: 'varchar', nullable: true })
  containerIp?: string;

  @Column({ type: 'int', default: 1 })
  cpuLimit!: number;

  @Column({ type: 'varchar', length: 50, default: '512m' })
  memoryLimit!: string;

  @Column({ type: 'varchar', length: 50, default: '10g' })
  diskLimit!: string;

  @Column({ type: 'simple-json', default: {} })
  ports!: Record<string, string>;

  @Column({ type: 'simple-json', default: {} })
  envVars!: Record<string, string>;

  @Column({ type: 'simple-json', default: {} })
  labels!: Record<string, string>;

  @Column({ type: 'boolean', default: false })
  gpu!: boolean;

  @Column({ type: 'varchar', nullable: true })
  userId?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  // No explicit `type` — see api-key.entity.ts for why 'datetime' breaks Postgres.
  @Column({ nullable: true })
  lastActiveAt?: Date;
}
