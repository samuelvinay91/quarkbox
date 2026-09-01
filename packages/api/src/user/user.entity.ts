import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name?: string;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'varchar', length: 50, default: 'user' })
  role!: string;

  @Column({ type: 'varchar', length: 50, default: 'free' })
  plan!: string;

  @Column({ type: 'int', default: 0 })
  dailySandboxCount!: number;

  @Column({ type: 'date', nullable: true })
  dailyCountDate?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  mfaSecret?: string;

  @Column({ type: 'boolean', default: false })
  mfaEnabled!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
