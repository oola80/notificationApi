import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'event_mappings', schema: 'event_ingestion_service' })
export class EventMapping {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'source_id', type: 'varchar', length: 50 })
  sourceId: string;

  @Column({ name: 'event_type', type: 'varchar', length: 100 })
  eventType: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'field_mappings', type: 'jsonb' })
  fieldMappings: Record<string, any>;

  @Column({ name: 'event_type_mapping', type: 'jsonb', nullable: true })
  eventTypeMapping: Record<string, any> | null;

  @Column({
    name: 'timestamp_field',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  timestampField: string | null;

  @Column({
    name: 'timestamp_format',
    type: 'varchar',
    length: 50,
    default: 'iso8601',
  })
  timestampFormat: string;

  @Column({
    name: 'source_event_id_field',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  sourceEventIdField: string | null;

  @Column({ name: 'validation_schema', type: 'jsonb', nullable: true })
  validationSchema: Record<string, any> | null;

  @Column({ type: 'varchar', length: 10, default: 'normal' })
  priority: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'integer', default: 1 })
  version: number;

  @Column({ name: 'created_by', type: 'varchar', length: 100, nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'varchar', length: 100, nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
