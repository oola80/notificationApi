import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'notifications', schema: 'notification_engine_service' })
export class Notification {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({
    name: 'notification_id',
    type: 'uuid',
    unique: true,
    default: () => 'gen_random_uuid()',
  })
  notificationId: string;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId: string;

  @Column({ name: 'rule_id', type: 'uuid' })
  ruleId: string;

  @Column({ name: 'template_id', type: 'varchar', length: 100 })
  templateId: string;

  @Column({
    name: 'template_version',
    type: 'integer',
    nullable: true,
  })
  templateVersion: number | null;

  @Column({ type: 'varchar', length: 20 })
  channel: string;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: string;

  @Column({ type: 'varchar', length: 10, default: 'normal' })
  priority: string;

  @Column({
    name: 'recipient_email',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  recipientEmail: string | null;

  @Column({
    name: 'recipient_phone',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  recipientPhone: string | null;

  @Column({
    name: 'recipient_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  recipientName: string | null;

  @Column({
    name: 'customer_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  customerId: string | null;

  @Column({
    name: 'dedup_key_hash',
    type: 'char',
    length: 64,
    nullable: true,
  })
  dedupKeyHash: string | null;

  @Column({
    name: 'dedup_key_values',
    type: 'jsonb',
    nullable: true,
  })
  dedupKeyValues: Record<string, any> | null;

  @Column({
    name: 'rendered_content',
    type: 'jsonb',
    nullable: true,
  })
  renderedContent: Record<string, any> | null;

  @Column({
    name: 'correlation_id',
    type: 'uuid',
    nullable: true,
  })
  correlationId: string | null;

  @Column({
    name: 'cycle_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  cycleId: string | null;

  @Column({
    name: 'source_id',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  sourceId: string | null;

  @Column({
    name: 'event_type',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  eventType: string | null;

  @Column({
    name: 'error_message',
    type: 'text',
    nullable: true,
  })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
