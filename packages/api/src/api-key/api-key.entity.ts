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

  // Explicit 'uuid' to match User.id's actual column type — see
  // snapshot.entity.ts's sandboxId for why this can't be 'varchar' or inferred.
  @Column({ type: 'uuid' })
  userId!: string;

  // No explicit `type` — let TypeORM infer per-dialect from the TS `Date`
  // type (postgres: timestamp, sqlite: datetime). A hardcoded 'datetime'
  // here makes DataSource.initialize() throw DataTypeNotSupportedError
  // against Postgres, unconditionally, before any query even runs.
  @Column({ nullable: true })
  lastUsedAt?: Date;

  @Column({ nullable: true })
  expiresAt?: Date;

  @CreateDateColumn()
  createdAt!: Date;
}
