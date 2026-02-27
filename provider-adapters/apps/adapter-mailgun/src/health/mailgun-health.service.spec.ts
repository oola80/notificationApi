import { MailgunHealthService } from './mailgun-health.service.js';

describe('MailgunHealthService', () => {
  let service: MailgunHealthService;
  let mockMailgunClient: any;
  let mockConfigService: any;

  beforeEach(() => {
    mockMailgunClient = {
      getDomainInfo: jest.fn(),
      getDomain: jest.fn().mockReturnValue('distelsa.info'),
    };
    mockConfigService = {
      get: jest.fn((key: string, def?: any) => {
        const values: Record<string, any> = {
          'mailgun.region': 'us',
        };
        return values[key] ?? def;
      }),
    };
    service = new MailgunHealthService(mockMailgunClient, mockConfigService);
  });

  it('should return correct providerId', () => {
    expect(service.getProviderId()).toBe('mailgun');
  });

  it('should return correct providerName', () => {
    expect(service.getProviderName()).toBe('Mailgun');
  });

  it('should return correct supported channels', () => {
    expect(service.getSupportedChannels()).toEqual(['email']);
  });

  it('should return ok when Mailgun API responds successfully', async () => {
    mockMailgunClient.getDomainInfo.mockResolvedValue({
      domain: { state: 'active' },
    });

    const result = await service.checkProviderConnectivity();

    expect(result.ok).toBe(true);
    expect(result.details.domain).toBe('distelsa.info');
    expect(result.details.state).toBe('active');
    expect(result.details.region).toBe('us');
    expect(mockMailgunClient.getDomainInfo).toHaveBeenCalled();
  });

  it('should return not ok when Mailgun API fails', async () => {
    mockMailgunClient.getDomainInfo.mockRejectedValue(
      new Error('Connection refused'),
    );

    const result = await service.checkProviderConnectivity();

    expect(result.ok).toBe(false);
    expect(result.details.error).toBe('Connection refused');
  });

  it('should return full health via getHealth()', async () => {
    mockMailgunClient.getDomainInfo.mockResolvedValue({
      domain: { state: 'active' },
    });

    const health = await service.getHealth();

    expect(health.status).toBe('ok');
    expect(health.providerId).toBe('mailgun');
    expect(health.providerName).toBe('Mailgun');
    expect(health.supportedChannels).toEqual(['email']);
  });

  it('should return down health when API fails', async () => {
    mockMailgunClient.getDomainInfo.mockRejectedValue(new Error('Timeout'));

    const health = await service.getHealth();

    expect(health.status).toBe('down');
    expect(health.providerId).toBe('mailgun');
  });
});
