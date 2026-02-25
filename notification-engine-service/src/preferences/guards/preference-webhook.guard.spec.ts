import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext, HttpException } from '@nestjs/common';
import { PreferenceWebhookGuard } from './preference-webhook.guard.js';

describe('PreferenceWebhookGuard', () => {
  let guard: PreferenceWebhookGuard;

  const createMockContext = (apiKey?: string): ExecutionContext => {
    const headers: Record<string, string> = {};
    if (apiKey !== undefined) {
      headers['x-api-key'] = apiKey;
    }

    return {
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PreferenceWebhookGuard,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('valid-api-key-123'),
          },
        },
      ],
    }).compile();

    guard = module.get<PreferenceWebhookGuard>(PreferenceWebhookGuard);
  });

  it('should allow request with valid API key', () => {
    const context = createMockContext('valid-api-key-123');
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw NES-013 with invalid API key', () => {
    const context = createMockContext('wrong-key');
    try {
      guard.canActivate(context);
      fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getResponse()).toEqual(
        expect.objectContaining({ code: 'NES-013' }),
      );
    }
  });

  it('should throw NES-013 with missing API key', () => {
    const context = createMockContext();
    try {
      guard.canActivate(context);
      fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getResponse()).toEqual(
        expect.objectContaining({ code: 'NES-013' }),
      );
    }
  });

  it('should throw NES-013 with empty API key', () => {
    const context = createMockContext('');
    try {
      guard.canActivate(context);
      fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getResponse()).toEqual(
        expect.objectContaining({ code: 'NES-013' }),
      );
    }
  });
});
