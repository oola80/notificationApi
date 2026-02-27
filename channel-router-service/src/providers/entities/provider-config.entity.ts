import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'provider_configs', schema: 'channel_router_service' })
export class ProviderConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'provider_name', type: 'varchar', length: 50 })
  providerName: string;

  @Column({ name: 'provider_id', type: 'varchar', length: 50 })
  providerId: string;

  @Column({ type: 'varchar', length: 20 })
  channel: string;

  @Column({ name: 'adapter_url', type: 'varchar', length: 255 })
  adapterUrl: string;

  @Column({ name: 'config_json', type: 'jsonb', nullable: true })
  configJson: Record<string, any> | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({
    name: 'routing_weight',
    type: 'integer',
    nullable: true,
    default: 100,
  })
  routingWeight: number | null;

  @Column({
    name: 'rate_limit_tokens_per_sec',
    type: 'integer',
    nullable: true,
  })
  rateLimitTokensPerSec: number | null;

  @Column({ name: 'rate_limit_max_burst', type: 'integer', nullable: true })
  rateLimitMaxBurst: number | null;

  @Column({
    name: 'circuit_breaker_state',
    type: 'varchar',
    length: 20,
    default: 'CLOSED',
  })
  circuitBreakerState: string;

  @Column({ name: 'failure_count', type: 'integer', default: 0 })
  failureCount: number;

  @Column({ name: 'last_failure_at', type: 'timestamptz', nullable: true })
  lastFailureAt: Date | null;

  @Column({ name: 'last_health_check', type: 'timestamptz', nullable: true })
  lastHealthCheck: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
