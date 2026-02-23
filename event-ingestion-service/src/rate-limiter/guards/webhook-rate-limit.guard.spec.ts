import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, HttpException } from '@nestjs/common';
import { WebhookRateLimitGuard } from './webhook-rate-limit.guard.js';
import { RateLimiterService } from '../rate-limiter.service.js';

describe('WebhookRateLimitGuard', () => {
  let guard: WebhookRateLimitGuard;
  let rateLimiterService: jest.Mocked<RateLimiterService>;

  const createMockContext = (): ExecutionContext => {
    const mockSetHeader = jest.fn();
    return {
      switchToHttp: () => ({
        getResponse: () => ({
          setHeader: mockSetHeader,
        }),
        getRequest: () => ({}),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
      getArgs: () => [],
      getArgByIndex: () => ({}),
      switchToRpc: () => ({}) as any,
      switchToWs: () => ({}) as any,
      getType: () => 'http',
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookRateLimitGuard,
        {
          provide: RateLimiterService,
          useValue: {
            checkGlobalWebhookLimit: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<WebhookRateLimitGuard>(WebhookRateLimitGuard);
    rateLimiterService = module.get(RateLimiterService);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow request when rate limit is not exceeded', () => {
    rateLimiterService.checkGlobalWebhookLimit.mockReturnValue(true);
    const context = createMockContext();

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw EIS-017 when rate limit is exceeded', () => {
    rateLimiterService.checkGlobalWebhookLimit.mockReturnValue(false);
    const context = createMockContext();

    try {
      guard.canActivate(context);
      fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      const response = (error as HttpException).getResponse() as any;
      expect(response.code).toBe('EIS-017');
      expect(response.status).toBe(429);
    }
  });

  it('should set Retry-After header when rate limit is exceeded', () => {
    rateLimiterService.checkGlobalWebhookLimit.mockReturnValue(false);
    const context = createMockContext();
    const mockSetHeader = context.switchToHttp().getResponse()
      .setHeader as jest.Mock;

    try {
      guard.canActivate(context);
    } catch {
      // Expected
    }

    expect(mockSetHeader).toHaveBeenCalledWith('Retry-After', '1');
  });
});
