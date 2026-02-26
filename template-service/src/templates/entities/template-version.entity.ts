import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Template } from './template.entity.js';
import { TemplateChannel } from './template-channel.entity.js';

@Entity({ name: 'template_versions', schema: 'template_service' })
export class TemplateVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'template_id', type: 'uuid' })
  templateId: string;

  @Column({ name: 'version_number', type: 'integer' })
  versionNumber: number;

  @Column({ name: 'change_summary', type: 'text', nullable: true })
  changeSummary: string | null;

  @Column({ name: 'created_by', type: 'varchar', length: 100, nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Template, (t) => t.versions)
  @JoinColumn({ name: 'template_id' })
  template: Template;

  @OneToMany(() => TemplateChannel, (c) => c.version)
  channels: TemplateChannel[];
}
