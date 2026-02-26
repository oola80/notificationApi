import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TemplateVersion } from './template-version.entity.js';

@Entity({ name: 'template_channels', schema: 'template_service' })
export class TemplateChannel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'template_version_id', type: 'uuid' })
  templateVersionId: string;

  @Column({ type: 'varchar', length: 20 })
  channel: string;

  @Column({ type: 'text', nullable: true })
  subject: string | null;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => TemplateVersion, (v) => v.channels)
  @JoinColumn({ name: 'template_version_id' })
  version: TemplateVersion;
}
