import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'event_sources', schema: 'event_ingestion_service' })
export class EventSource {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 50, unique: true })
  name: string;

  @Column({ name: 'display_name', type: 'varchar', length: 100 })
  displayName: string;

  @Column({ type: 'varchar', length: 20 })
  type: string;

  @Column({ name: 'connection_config', type: 'jsonb', nullable: true })
  connectionConfig: Record<string, any> | null;

  @Column({
    name: 'api_key_hash',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  apiKeyHash: string | null;

  @Column({
    name: 'signing_secret_hash',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  signingSecretHash: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'rate_limit', type: 'integer', nullable: true })
  rateLimit: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
