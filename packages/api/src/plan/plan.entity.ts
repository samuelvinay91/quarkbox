import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ type: 'int', default: 1 })
  maxConcurrentSandboxes: number;

  @Column({ type: 'int', default: 30 })
  maxSandboxesPerDay: number;

  @Column({ type: 'int', default: 1 })
  maxCpuPerSandbox: number;

  @Column({ type: 'varchar', default: '2g' })
  maxMemoryPerSandbox: string;

  @Column({ type: 'int', default: 0 })
  maxClusters: number;

  @Column({ type: 'varchar', default: '5g' })
  maxDiskPerSandbox: string;

  @Column({ default: true })
  snapshotsEnabled: boolean;
}
