import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity({
  name: 'notification_recipients',
  schema: 'notification_engine_service',
})
export class NotificationRecipient {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'notification_id', type: 'uuid' })
  notificationId: string;

  @Column({ name: 'recipient_type', type: 'varchar', length: 20 })
  recipientType: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({ name: 'device_token', type: 'text', nullable: true })
  deviceToken: string | null;

  @Column({ name: 'member_name', type: 'varchar', length: 255, nullable: true })
  memberName: string | null;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
