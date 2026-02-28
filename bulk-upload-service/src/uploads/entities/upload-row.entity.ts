import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Upload } from './upload.entity.js';

export enum UploadRowStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

@Entity({ name: 'upload_rows', schema: 'bulk_upload_service' })
export class UploadRow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'upload_id', type: 'uuid' })
  uploadId: string;

  @ManyToOne(() => Upload, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'upload_id' })
  upload: Upload;

  @Column({ name: 'row_number', type: 'integer' })
  rowNumber: number;

  @Column({ name: 'group_key', type: 'varchar', length: 500, nullable: true })
  groupKey: string | null;

  @Column({ name: 'raw_data', type: 'jsonb' })
  rawData: Record<string, any>;

  @Column({ name: 'mapped_payload', type: 'jsonb', nullable: true })
  mappedPayload: Record<string, any> | null;

  @Column({ name: 'event_id', type: 'uuid', nullable: true })
  eventId: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: UploadRowStatus.PENDING,
  })
  status: UploadRowStatus;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;
}
