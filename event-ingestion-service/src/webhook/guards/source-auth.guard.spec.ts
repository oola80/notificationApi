import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { SourceAuthGuard } from './source-auth.guard.js';
import { SourceAuthService } from '../services/source-auth.service.js';
import { EventSource } from '../../event-sources/entities/event-source.entity.js';

describe('SourceAuthGuard', () => {
  let guard: SourceAuthGuard;
  let authService: jest.Mocked<SourceAuthService>;

  const mockSource: EventSource = {
    id: 1,
    name: 'shopify',
    displayName: 'Shopify',
    type: 'webhook',
    connectionConfig: null,
    apiKeyHash: 'hash',
    signingSecretHash: null,
    isActive: true,
    rateLimit: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const createMockContext = (body: any, headers: any = {}): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ body, headers }),
      }),
    }) as any;

  beforeEach(async () => {
    const mockAuthService = {
      authenticateSource: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SourceAuthGuard,
        { provide: SourceAuthService, useValue: mockAuthService },
      ],
    }).compile();

    guard = module.get<SourceAuthGuard>(SourceAuthGuard);
    authService = module.get(SourceAuthService);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should return true and attach eventSource when auth succeeds', async () => {
    authService.authenticateSource.mockResolvedValue(mockSource);

    const request: any = {
      body: { sourceId: 'shopify', payload: {} },
      headers: { 'x-api-key': 'key' },
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as any;

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request['eventSource']).toEqual(mockSource);
  });

  it('should return false when sourceId is missing from body', async () => {
    const context = createMockContext({}, {});

    const result = await guard.canActivate(context);
    expect(result).toBe(false);
  });

  it('should propagate auth errors from SourceAuthService', async () => {
    authService.authenticateSource.mockRejectedValue(new Error('Auth failed'));

    const context = createMockContext(
      { sourceId: 'shopify', payload: {} },
      { 'x-api-key': 'bad' },
    );

    await expect(guard.canActivate(context)).rejects.toThrow('Auth failed');
  });
});
