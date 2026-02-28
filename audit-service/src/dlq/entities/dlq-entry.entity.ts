import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
} from 'typeorm';

export enum DlqEntryStatus {
  PENDING = 'pending',
  INVESTIGATED = 'investigated',
  REPROCESSED = 'reprocessed',
  DISCARDED = 'discarded',
}

@Entity('dlq_entries')
@Index('idx_dlq_entries_status', ['status'])
export class DlqEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'original_queue', type: 'varchar', length: 255 })
  originalQueue: string;

  @Column({ name: 'original_exchange', type: 'varchar', length: 255 })
  originalExchange: string;

  @Column({ name: 'original_routing_key', type: 'varchar', length: 255, nullable: true })
  originalRoutingKey: string | null;

  @Column({ name: 'rejection_reason', type: 'varchar', length: 500, nullable: true })
  rejectionReason: string | null;

  @Column({ name: 'retry_count', type: 'integer', default: 0 })
  retryCount: number;

  @Column({ type: 'jsonb' })
  payload: Record<string, any>;

  @Column({ name: 'x_death_headers', type: 'jsonb', nullable: true })
  xDeathHeaders: Record<string, any> | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: DlqEntryStatus.PENDING,
  })
  status: DlqEntryStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'captured_at', type: 'timestamptz', default: () => 'NOW()' })
  capturedAt: Date;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ name: 'resolved_by', type: 'varchar', length: 255, nullable: true })
  resolvedBy: string | null;
}
