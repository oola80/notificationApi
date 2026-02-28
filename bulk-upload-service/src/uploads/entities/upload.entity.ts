import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum UploadStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  PARTIAL = 'partial',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

@Entity({ name: 'uploads', schema: 'bulk_upload_service' })
export class Upload {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName: string;

  @Column({ name: 'file_size', type: 'integer' })
  fileSize: number;

  @Column({ name: 'total_rows', type: 'integer' })
  totalRows: number;

  @Column({ name: 'total_events', type: 'integer', nullable: true })
  totalEvents: number | null;

  @Column({ name: 'processed_rows', type: 'integer', default: 0 })
  processedRows: number;

  @Column({ name: 'succeeded_rows', type: 'integer', default: 0 })
  succeededRows: number;

  @Column({ name: 'failed_rows', type: 'integer', default: 0 })
  failedRows: number;

  @Column({
    type: 'varchar',
    length: 20,
    default: UploadStatus.QUEUED,
  })
  status: UploadStatus;

  @Column({ name: 'uploaded_by', type: 'uuid' })
  uploadedBy: string;

  @Column({
    name: 'original_file_path',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  originalFilePath: string | null;

  @Column({
    name: 'result_file_path',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  resultFilePath: string | null;

  @Column({
    name: 'result_generated_at',
    type: 'timestamptz',
    nullable: true,
  })
  resultGeneratedAt: Date | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
