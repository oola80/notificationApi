import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('delivery_receipts')
@Index('idx_delivery_receipts_notification_id', ['notificationId'])
@Index('idx_delivery_receipts_provider_msg_id', ['providerMessageId'])
@Index('idx_delivery_receipts_received_at', ['receivedAt'])
@Index('idx_delivery_receipts_status', ['status'])
export class DeliveryReceipt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'notification_id', type: 'varchar', length: 255, nullable: true })
  notificationId: string | null;

  @Column({ name: 'correlation_id', type: 'varchar', length: 255, nullable: true })
  correlationId: string | null;

  @Column({ name: 'cycle_id', type: 'varchar', length: 255, nullable: true })
  cycleId: string | null;

  @Column({ type: 'varchar', length: 20 })
  channel: string;

  @Column({ type: 'varchar', length: 50 })
  provider: string;

  @Column({ type: 'varchar', length: 30 })
  status: string;

  @Column({ name: 'provider_message_id', type: 'varchar', length: 255, nullable: true })
  providerMessageId: string | null;

  @Column({ name: 'raw_response', type: 'jsonb', nullable: true })
  rawResponse: Record<string, any> | null;

  @CreateDateColumn({ name: 'received_at', type: 'timestamptz' })
  receivedAt: Date;
}
