import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum TemplateCategory {
  AI_AGENTS = 'AI & Autonomous Agents',
  WEB_FULLSTACK = 'Web & Full-Stack',
  DATA_SCIENCE = 'Data Science & ML',
  SYSTEMS_BACKEND = 'Systems & Backend',
  DATABASES = 'Databases & Vector Stores',
  DEVOPS_CLOUD = 'DevOps & Tooling',
}

export interface TemplateEnvVar {
  key: string;
  label: string;
  description: string;
  defaultValue?: string;
  required: boolean;
  secret?: boolean;
}

export interface TemplatePort {
  port: number;
  label: string;
  protocol: 'http' | 'tcp' | 'grpc';
  autoForward?: boolean;
}

@Entity('marketplace_templates')
export class MarketplaceTemplate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  slug!: string;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({ type: 'varchar', length: 50, default: TemplateCategory.AI_AGENTS })
  category!: TemplateCategory;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'varchar', length: 20, default: '🚀' })
  icon!: string;

  @Column({ type: 'varchar', length: 255 })
  image!: string;

  @Column({ type: 'int', default: 2 })
  defaultCpu!: number;

  @Column({ type: 'varchar', length: 20, default: '1g' })
  defaultMemory!: string;

  @Column({ type: 'varchar', length: 20, default: '10g' })
  defaultDisk!: string;

  @Column({ type: 'simple-json', nullable: true })
  ports!: TemplatePort[];

  @Column({ type: 'simple-json', nullable: true })
  envVars!: TemplateEnvVar[];

  @Column({ type: 'simple-array', nullable: true })
  tags!: string[];

  @Column({ type: 'varchar', length: 255, default: '/workspace' })
  recommendedWorkdir!: string;

  @Column({ type: 'text', nullable: true })
  postLaunchScript?: string;

  @Column({ type: 'varchar', length: 100, default: 'QuarkBox Official' })
  publisher!: string;

  @Column({ type: 'boolean', default: true })
  isOfficial!: boolean;

  @Column({ type: 'boolean', default: true })
  isVerified!: boolean;

  @Column({ type: 'int', default: 0 })
  launchesCount!: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  readmeUrl?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
