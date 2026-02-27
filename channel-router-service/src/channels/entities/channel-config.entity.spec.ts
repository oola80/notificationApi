import { ChannelConfig } from './channel-config.entity.js';

describe('ChannelConfig Entity', () => {
  it('should create a ChannelConfig instance', () => {
    const config = new ChannelConfig();
    config.id = '550e8400-e29b-41d4-a716-446655440010';
    config.channelId = '550e8400-e29b-41d4-a716-446655440001';
    config.configKey = 'fromAddress';
    config.configValue = 'noreply@example.com';
    config.isEncrypted = false;
    config.createdAt = new Date();
    config.updatedAt = new Date();

    expect(config.id).toBe('550e8400-e29b-41d4-a716-446655440010');
    expect(config.channelId).toBe('550e8400-e29b-41d4-a716-446655440001');
    expect(config.configKey).toBe('fromAddress');
    expect(config.configValue).toBe('noreply@example.com');
    expect(config.isEncrypted).toBe(false);
  });

  it('should support encrypted config values', () => {
    const config = new ChannelConfig();
    config.configKey = 'apiSecret';
    config.configValue = 'encrypted_value_here';
    config.isEncrypted = true;

    expect(config.isEncrypted).toBe(true);
  });
});
