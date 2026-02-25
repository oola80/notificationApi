import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'notification_rules', schema: 'notification_engine_service' })
export class NotificationRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'event_type', type: 'varchar', length: 100 })
  eventType: string;

  @Column({ type: 'jsonb', nullable: true })
  conditions: Record<string, any> | null;

  @Column({ type: 'jsonb' })
  actions: Record<string, any>[];

  @Column({ type: 'jsonb', nullable: true })
  suppression: Record<string, any> | null;

  @Column({
    name: 'delivery_priority',
    type: 'varchar',
    length: 10,
    nullable: true,
  })
  deliveryPriority: string | null;

  @Column({ type: 'integer', default: 100 })
  priority: number;

  @Column({ name: 'is_exclusive', type: 'boolean', default: false })
  isExclusive: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_by', type: 'varchar', length: 100, nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'varchar', length: 100, nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
