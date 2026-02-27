import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Channel } from './channel.entity.js';

@Entity({ name: 'channel_configs', schema: 'channel_router_service' })
export class ChannelConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'channel_id', type: 'uuid' })
  channelId: string;

  @ManyToOne(() => Channel, (channel) => channel.configs)
  @JoinColumn({ name: 'channel_id' })
  channel: Channel;

  @Column({ name: 'config_key', type: 'varchar', length: 100 })
  configKey: string;

  @Column({ name: 'config_value', type: 'text' })
  configValue: string;

  @Column({ name: 'is_encrypted', type: 'boolean', default: false })
  isEncrypted: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
