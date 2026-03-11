import { SesClientFactoryService } from './ses-client-factory.service.js';

describe('SesClientFactoryService', () => {
  let factory: SesClientFactoryService;
  let mockConfigService: any;
  let mockSmtpClient: any;
  let mockApiClient: any;

  beforeEach(() => {
    mockSmtpClient = { sendEmail: jest.fn(), checkConnectivity: jest.fn() };
    mockApiClient = { sendEmail: jest.fn(), checkConnectivity: jest.fn() };
    mockConfigService = {
      get: jest.fn(),
    };
  });

  it('should return SMTP client when mode=smtp', () => {
    mockConfigService.get.mockReturnValue('smtp');
    factory = new SesClientFactoryService(
      mockConfigService,
      mockSmtpClient,
      mockApiClient,
    );

    const client = factory.getClient();

    expect(client).toBe(mockSmtpClient);
  });

  it('should return API client when mode=api', () => {
    mockConfigService.get.mockReturnValue('api');
    factory = new SesClientFactoryService(
      mockConfigService,
      mockSmtpClient,
      mockApiClient,
    );

    const client = factory.getClient();

    expect(client).toBe(mockApiClient);
  });

  it('should throw on invalid mode', () => {
    mockConfigService.get.mockReturnValue('invalid');
    factory = new SesClientFactoryService(
      mockConfigService,
      mockSmtpClient,
      mockApiClient,
    );

    expect(() => factory.getClient()).toThrow(
      'Invalid SES_MODE: "invalid". Must be "smtp" or "api".',
    );
  });

  it('should default to smtp when mode is not set', () => {
    mockConfigService.get.mockImplementation(
      (key: string, def?: any) => def,
    );
    factory = new SesClientFactoryService(
      mockConfigService,
      mockSmtpClient,
      mockApiClient,
    );

    const client = factory.getClient();

    expect(client).toBe(mockSmtpClient);
  });
});
