import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ClusterStatus {
  CREATING = 'creating',
  RUNNING = 'running',
  STOPPED = 'stopped',
  ERROR = 'error',
}

export interface ClusterNodeConfig {
  name: string;
  templateSlug?: string;
  image?: string;
  cpuLimit?: number;
  memoryLimit?: string;
  envVars?: Record<string, string>;
  networkAlias: string;
  ports?: Record<string, string>;
}

@Entity('clusters')
export class Cluster {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 150 })
  networkName!: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: ClusterStatus.CREATING,
  })
  status!: ClusterStatus;

  @Column({ type: 'simple-json', nullable: true })
  nodes!: ClusterNodeConfig[];

  @Column({ type: 'simple-array', nullable: true })
  sandboxIds!: string[];

  @Column({ type: 'varchar', length: 100, nullable: true })
  userId?: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
