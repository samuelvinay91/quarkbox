import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('revoked_tokens')
export class RevokedToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  @Index({ unique: true })
  tokenHash!: string;

  @Column({ type: 'varchar', nullable: true })
  userId?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  reason?: string;

  // No explicit `type` — see api-key.entity.ts for why 'datetime' breaks Postgres.
  @Column()
  expiresAt!: Date;

  @CreateDateColumn()
  revokedAt!: Date;
}
