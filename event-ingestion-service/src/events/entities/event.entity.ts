import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'events', schema: 'event_ingestion_service' })
export class Event {
  @PrimaryGeneratedColumn('identity', { type: 'bigint' })
  id: string;

  @Column({
    name: 'event_id',
    type: 'uuid',
    unique: true,
    generated: 'uuid',
  })
  eventId: string;

  @Column({ name: 'source_id', type: 'varchar', length: 50 })
  sourceId: string;

  @Column({ name: 'cycle_id', type: 'varchar', length: 255 })
  cycleId: string;

  @Column({ name: 'event_type', type: 'varchar', length: 100 })
  eventType: string;

  @Column({
    name: 'source_event_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  sourceEventId: string | null;

  @Column({ name: 'raw_payload', type: 'jsonb' })
  rawPayload: Record<string, any>;

  @Column({ name: 'normalized_payload', type: 'jsonb', nullable: true })
  normalizedPayload: Record<string, any> | null;

  @Column({ type: 'varchar', length: 20, default: 'received' })
  status: string;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'correlation_id', type: 'uuid', nullable: true })
  correlationId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
