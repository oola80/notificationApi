import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { createHash, createHmac } from 'crypto';
import { SourceAuthService } from './source-auth.service.js';
import { EventSourcesRepository } from '../../event-sources/event-sources.repository.js';
import { EventSource } from '../../event-sources/entities/event-source.entity.js';

describe('SourceAuthService', () => {
  let service: SourceAuthService;
  let repository: jest.Mocked<EventSourcesRepository>;

  const apiKey = 'my-secret-api-key';
  const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');

  const mockSource: EventSource = {
    id: 1,
    name: 'shopify',
    displayName: 'Shopify',
    type: 'webhook',
    connectionConfig: null,
    apiKeyHash,
    signingSecretHash: null,
    isActive: true,
    rateLimit: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockRepository = {
      findByName: jest.fn(),
      findById: jest.fn(),
      findWithPagination: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SourceAuthService,
        { provide: EventSourcesRepository, useValue: mockRepository },
      ],
    }).compile();

    service = module.get<SourceAuthService>(SourceAuthService);
    repository = module.get(EventSourcesRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should authenticate via API key', async () => {
    repository.findByName.mockResolvedValue(mockSource);

    const result = await service.authenticateSource('shopify', {
      'x-api-key': apiKey,
    });

    expect(result).toEqual(mockSource);
  });

  it('should authenticate via Bearer token', async () => {
    repository.findByName.mockResolvedValue(mockSource);

    const result = await service.authenticateSource('shopify', {
      authorization: `Bearer ${apiKey}`,
    });

    expect(result).toEqual(mockSource);
  });

  it('should authenticate via HMAC signature', async () => {
    const signingSecret = 'my-signing-secret';
    const signingSecretHash = createHash('sha256')
      .update(signingSecret)
      .digest('hex');
    const sourceWithHmac = {
      ...mockSource,
      signingSecretHash,
      apiKeyHash: null,
    };
    repository.findByName.mockResolvedValue(sourceWithHmac);

    const body = '{"test": true}';
    const signature = createHmac('sha256', signingSecretHash)
      .update(body)
      .digest('hex');

    const result = await service.authenticateSource(
      'shopify',
      { 'x-signature': signature },
      body,
    );

    expect(result).toEqual(sourceWithHmac);
  });

  it('should throw EIS-003 when source not found', async () => {
    repository.findByName.mockResolvedValue(null);

    try {
      await service.authenticateSource('unknown', {});
      fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      const response = (error as HttpException).getResponse() as any;
      expect(response.code).toBe('EIS-003');
    }
  });

  it('should throw EIS-008 when source is inactive', async () => {
    repository.findByName.mockResolvedValue({ ...mockSource, isActive: false });

    try {
      await service.authenticateSource('shopify', { 'x-api-key': apiKey });
      fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      const response = (error as HttpException).getResponse() as any;
      expect(response.code).toBe('EIS-008');
    }
  });

  it('should throw EIS-013 when credentials are invalid', async () => {
    repository.findByName.mockResolvedValue(mockSource);

    try {
      await service.authenticateSource('shopify', {
        'x-api-key': 'wrong-key',
      });
      fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      const response = (error as HttpException).getResponse() as any;
      expect(response.code).toBe('EIS-013');
    }
  });
});
