import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../user/user.entity';

@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 255 })
  keyHash!: string;

  @Column({ type: 'varchar', length: 8 })
  keyPrefix!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'varchar' })
  userId!: string;

  @Column({ type: 'datetime', nullable: true })
  lastUsedAt?: Date;

  @Column({ type: 'datetime', nullable: true })
  expiresAt?: Date;

  @CreateDateColumn()
  createdAt!: Date;
}
