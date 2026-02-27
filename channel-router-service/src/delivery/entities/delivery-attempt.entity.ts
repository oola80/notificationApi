import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ProviderConfig } from '../../providers/entities/provider-config.entity.js';

@Entity({ name: 'delivery_attempts', schema: 'channel_router_service' })
export class DeliveryAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'notification_id', type: 'uuid' })
  notificationId: string;

  @Column({ name: 'correlation_id', type: 'uuid', nullable: true })
  correlationId: string | null;

  @Column({ type: 'varchar', length: 20 })
  channel: string;

  @Column({ name: 'provider_id', type: 'uuid' })
  providerId: string;

  @ManyToOne(() => ProviderConfig)
  @JoinColumn({ name: 'provider_id' })
  provider: ProviderConfig;

  @Column({ name: 'attempt_number', type: 'integer', default: 1 })
  attemptNumber: number;

  @Column({ type: 'varchar', length: 20 })
  status: string;

  @Column({ name: 'provider_response', type: 'jsonb', nullable: true })
  providerResponse: Record<string, any> | null;

  @Column({
    name: 'provider_message_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  providerMessageId: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @Column({
    name: 'attempted_at',
    type: 'timestamptz',
    default: () => 'NOW()',
  })
  attemptedAt: Date;

  @Column({ name: 'duration_ms', type: 'integer', nullable: true })
  durationMs: number | null;
}
