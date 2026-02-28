import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('notification_analytics')
@Index('idx_analytics_period_start', ['period', 'periodStart', 'channel'], {
  unique: true,
})
@Index('idx_analytics_event_type', ['period', 'periodStart', 'eventType'])
export class NotificationAnalytics {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 10 })
  period: string;

  @Column({ name: 'period_start', type: 'timestamptz' })
  periodStart: Date;

  @Column({ type: 'varchar', length: 20 })
  channel: string;

  @Column({ name: 'event_type', type: 'varchar', length: 255, nullable: true })
  eventType: string | null;

  @Column({ name: 'total_sent', type: 'integer', default: 0 })
  totalSent: number;

  @Column({ name: 'total_delivered', type: 'integer', default: 0 })
  totalDelivered: number;

  @Column({ name: 'total_failed', type: 'integer', default: 0 })
  totalFailed: number;

  @Column({ name: 'total_opened', type: 'integer', default: 0 })
  totalOpened: number;

  @Column({ name: 'total_clicked', type: 'integer', default: 0 })
  totalClicked: number;

  @Column({ name: 'total_bounced', type: 'integer', default: 0 })
  totalBounced: number;

  @Column({ name: 'total_suppressed', type: 'integer', default: 0 })
  totalSuppressed: number;

  @Column({ name: 'avg_latency_ms', type: 'numeric', precision: 10, scale: 2, nullable: true })
  avgLatencyMs: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
