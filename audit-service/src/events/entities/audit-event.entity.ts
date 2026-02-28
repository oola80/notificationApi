import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('audit_events')
@Index('idx_audit_events_notification_id', ['notificationId'])
@Index('idx_audit_events_correlation_id', ['correlationId'])
@Index('idx_audit_events_cycle_id', ['cycleId'])
@Index('idx_audit_events_event_type', ['eventType'])
@Index('idx_audit_events_created_at', ['createdAt'])
@Index('idx_audit_events_actor', ['actor'])
export class AuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'notification_id', type: 'varchar', length: 255, nullable: true })
  notificationId: string | null;

  @Column({ name: 'correlation_id', type: 'varchar', length: 255, nullable: true })
  correlationId: string | null;

  @Column({ name: 'cycle_id', type: 'varchar', length: 255, nullable: true })
  cycleId: string | null;

  @Column({ name: 'event_type', type: 'varchar', length: 100 })
  eventType: string;

  @Column({ type: 'varchar', length: 100 })
  actor: string;

  @Column({ type: 'jsonb', nullable: true, default: '{}' })
  metadata: Record<string, any> | null;

  @Column({ name: 'payload_snapshot', type: 'jsonb', nullable: true })
  payloadSnapshot: Record<string, any> | null;

  @Column({ name: 'search_vector', type: 'tsvector', nullable: true, select: false })
  searchVector: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
