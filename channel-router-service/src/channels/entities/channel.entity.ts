import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ChannelConfig } from './channel-config.entity.js';

@Entity({ name: 'channels', schema: 'channel_router_service' })
export class Channel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  name: string;

  @Column({ type: 'varchar', length: 20 })
  type: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({
    name: 'routing_mode',
    type: 'varchar',
    length: 20,
    default: 'primary',
  })
  routingMode: string;

  @Column({
    name: 'fallback_channel_id',
    type: 'uuid',
    nullable: true,
  })
  fallbackChannelId: string | null;

  @ManyToOne(() => Channel, { nullable: true })
  @JoinColumn({ name: 'fallback_channel_id' })
  fallbackChannel: Channel | null;

  @OneToMany(() => ChannelConfig, (config) => config.channel)
  configs: ChannelConfig[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
