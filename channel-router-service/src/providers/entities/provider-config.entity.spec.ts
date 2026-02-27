import { ProviderConfig } from './provider-config.entity.js';

describe('ProviderConfig Entity', () => {
  it('should create a ProviderConfig instance', () => {
    const provider = new ProviderConfig();
    provider.id = '550e8400-e29b-41d4-a716-446655440020';
    provider.providerName = 'SendGrid';
    provider.providerId = 'sendgrid';
    provider.channel = 'email';
    provider.adapterUrl = 'http://provider-adapter-sendgrid:3170';
    provider.configJson = { region: 'us-east-1' };
    provider.isActive = true;
    provider.routingWeight = 100;
    provider.rateLimitTokensPerSec = 50;
    provider.rateLimitMaxBurst = 100;
    provider.circuitBreakerState = 'CLOSED';
    provider.failureCount = 0;
    provider.lastFailureAt = null;
    provider.lastHealthCheck = null;
    provider.createdAt = new Date();
    provider.updatedAt = new Date();

    expect(provider.providerName).toBe('SendGrid');
    expect(provider.providerId).toBe('sendgrid');
    expect(provider.channel).toBe('email');
    expect(provider.adapterUrl).toBe('http://provider-adapter-sendgrid:3170');
    expect(provider.configJson).toEqual({ region: 'us-east-1' });
    expect(provider.circuitBreakerState).toBe('CLOSED');
  });

  it('should support all circuit breaker states', () => {
    const provider = new ProviderConfig();

    provider.circuitBreakerState = 'CLOSED';
    expect(provider.circuitBreakerState).toBe('CLOSED');

    provider.circuitBreakerState = 'OPEN';
    expect(provider.circuitBreakerState).toBe('OPEN');

    provider.circuitBreakerState = 'HALF_OPEN';
    expect(provider.circuitBreakerState).toBe('HALF_OPEN');
  });

  it('should support nullable fields', () => {
    const provider = new ProviderConfig();
    provider.configJson = null;
    provider.rateLimitTokensPerSec = null;
    provider.rateLimitMaxBurst = null;
    provider.lastFailureAt = null;
    provider.lastHealthCheck = null;

    expect(provider.configJson).toBeNull();
    expect(provider.rateLimitTokensPerSec).toBeNull();
    expect(provider.rateLimitMaxBurst).toBeNull();
  });

  it('should support all channel types', () => {
    const provider = new ProviderConfig();

    for (const channel of ['email', 'sms', 'whatsapp', 'push']) {
      provider.channel = channel;
      expect(provider.channel).toBe(channel);
    }
  });
});
