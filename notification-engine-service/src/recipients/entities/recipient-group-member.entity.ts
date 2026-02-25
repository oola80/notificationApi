import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { RecipientGroup } from './recipient-group.entity.js';

@Entity({
  name: 'recipient_group_members',
  schema: 'notification_engine_service',
})
export class RecipientGroupMember {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'group_id', type: 'uuid' })
  groupId: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({ name: 'device_token', type: 'text', nullable: true })
  deviceToken: string | null;

  @Column({ name: 'member_name', type: 'varchar', length: 255, nullable: true })
  memberName: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => RecipientGroup, (g) => g.members)
  @JoinColumn({ name: 'group_id' })
  group: RecipientGroup;
}
