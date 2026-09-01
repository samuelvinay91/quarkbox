import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('webhooks')
export class Webhook {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ length: 255 })
  url: string;

  @Column({ length: 100 })
  event: string;

  @Column({ default: true })
  active: boolean;

  @Column({ length: 100, nullable: true })
  secret: string;

  @Column({ nullable: true })
  lastDeliveryAt?: Date;

  @Column({ default: 0 })
  deliveryCount: number;

  @Column({ default: 0 })
  failureCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
