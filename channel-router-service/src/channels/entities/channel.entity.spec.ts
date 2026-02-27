import { Channel } from './channel.entity.js';

describe('Channel Entity', () => {
  it('should create a Channel instance', () => {
    const channel = new Channel();
    channel.id = '550e8400-e29b-41d4-a716-446655440000';
    channel.name = 'Email';
    channel.type = 'email';
    channel.isActive = true;
    channel.routingMode = 'primary';
    channel.fallbackChannelId = null;
    channel.createdAt = new Date();
    channel.updatedAt = new Date();

    expect(channel.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(channel.name).toBe('Email');
    expect(channel.type).toBe('email');
    expect(channel.isActive).toBe(true);
    expect(channel.routingMode).toBe('primary');
    expect(channel.fallbackChannelId).toBeNull();
  });

  it('should support self-referencing fallback channel', () => {
    const primary = new Channel();
    primary.id = '550e8400-e29b-41d4-a716-446655440001';
    primary.type = 'email';

    const fallback = new Channel();
    fallback.id = '550e8400-e29b-41d4-a716-446655440002';
    fallback.type = 'sms';

    primary.fallbackChannelId = fallback.id;
    primary.fallbackChannel = fallback;

    expect(primary.fallbackChannelId).toBe(fallback.id);
    expect(primary.fallbackChannel).toBe(fallback);
  });

  it('should support weighted routing mode', () => {
    const channel = new Channel();
    channel.routingMode = 'weighted';
    expect(channel.routingMode).toBe('weighted');
  });

  it('should support failover routing mode', () => {
    const channel = new Channel();
    channel.routingMode = 'failover';
    expect(channel.routingMode).toBe('failover');
  });
});
