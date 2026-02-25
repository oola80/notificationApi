import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({
  name: 'customer_channel_preferences',
  schema: 'notification_engine_service',
})
export class CustomerChannelPreference {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'customer_id', type: 'varchar', length: 100 })
  customerId: string;

  @Column({ type: 'varchar', length: 20 })
  channel: string;

  @Column({ name: 'is_opted_in', type: 'boolean', default: true })
  isOptedIn: boolean;

  @Column({
    name: 'source_system',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  sourceSystem: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
