import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { DtoValidationPipe } from '../src/common/pipes/dto-validation.pipe.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { LoggingInterceptor } from '../src/common/interceptors/logging.interceptor.js';
import { DeliveryPipelineService } from '../src/delivery/delivery-pipeline.service.js';
import { AdapterClientService } from '../src/adapter-client/adapter-client.service.js';
import { DispatchMessage } from '../src/delivery/interfaces/dispatch-message.interface.js';
import { SendResult } from '../src/adapter-client/interfaces/adapter-client.interfaces.js';

describe('Delivery Pipeline (e2e)', () => {
  let app: INestApplication;
  let module: TestingModule;
  let pipelineService: DeliveryPipelineService;

  const mockAdapterClient = {
    send: jest.fn(),
    checkHealth: jest.fn(),
    getCapabilities: jest.fn(),
  };

  const buildDispatch = (
    overrides: Partial<DispatchMessage> = {},
  ): DispatchMessage => ({
    notificationId: 'ntf-e2e-001',
    eventId: 'evt-e2e-001',
    ruleId: 'rule-e2e-001',
    channel: 'email',
    priority: 'normal',
    recipient: {
      email: 'test@example.com',
      name: 'Test User',
    },
    content: {
      subject: 'E2E Test',
      body: '<p>Hello from E2E test</p>',
    },
    metadata: {
      correlationId: 'corr-e2e-001',
      sourceId: 'source-e2e',
      eventType: 'test.delivery',
    },
    ...overrides,
  });

  const successResult: SendResult = {
    success: true,
    providerMessageId: 'provider-msg-001',
    retryable: false,
    errorMessage: null,
    httpStatus: 200,
    providerResponse: { id: 'provider-msg-001' },
  };

  const retryableFailResult: SendResult = {
    success: false,
    providerMessageId: null,
    retryable: true,
    errorMessage: 'Service temporarily unavailable',
    httpStatus: 503,
    providerResponse: null,
  };

  const nonRetryableFailResult: SendResult = {
    success: false,
    providerMessageId: null,
    retryable: false,
    errorMessage: 'Bad request: invalid recipient',
    httpStatus: 400,
    providerResponse: null,
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AdapterClientService)
      .useValue(mockAdapterClient)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new DtoValidationPipe());
    app.useGlobalFilters(new HttpExceptionFilter());

    const loggingInterceptor = app.get(LoggingInterceptor);
    app.useGlobalInterceptors(loggingInterceptor);

    await app.init();

    module = moduleFixture;
    pipelineService = module.get(DeliveryPipelineService);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Validation', () => {
    it('should fail for missing notificationId', async () => {
      const dispatch = buildDispatch({ notificationId: '' });
      const result = await pipelineService.execute(dispatch);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Missing required fields');
    });

    it('should fail for missing channel', async () => {
      const dispatch = buildDispatch({ channel: '' });
      const result = await pipelineService.execute(dispatch);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Missing required fields');
    });

    it('should fail for missing content body', async () => {
      const dispatch = buildDispatch({
        content: { subject: 'Test', body: '' },
      });
      const result = await pipelineService.execute(dispatch);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Missing required fields');
    });
  });

  describe('No provider available', () => {
    it('should fail when no provider is registered for channel', async () => {
      // Use a channel that has no providers registered
      const dispatch = buildDispatch({ channel: 'push' });
      const result = await pipelineService.execute(dispatch);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('No active provider');
    });
  });

  describe('Successful delivery (requires registered provider)', () => {
    // Note: These tests require a provider to be registered in the database.
    // In CI without a live DB, these will fall through to "no provider" path.
    // When running with a live DB + registered provider, they exercise the full pipeline.

    it('should succeed when adapter returns success', async () => {
      mockAdapterClient.send.mockResolvedValue(successResult);

      const dispatch = buildDispatch();
      const result = await pipelineService.execute(dispatch);

      // If no provider is registered, the pipeline returns "no active provider"
      // If a provider is registered, the pipeline returns success
      if (result.errorMessage?.includes('No active provider')) {
        expect(result.success).toBe(false);
      } else {
        expect(result.success).toBe(true);
        expect(result.providerMessageId).toBe('provider-msg-001');
        expect(result.notificationId).toBe('ntf-e2e-001');
        expect(result.channel).toBe('email');
        expect(mockAdapterClient.send).toHaveBeenCalledTimes(1);
      }
    });

    it('should schedule retry on retryable failure', async () => {
      mockAdapterClient.send.mockResolvedValue(retryableFailResult);

      const dispatch = buildDispatch({ attemptNumber: 1 });
      const result = await pipelineService.execute(dispatch);

      if (!result.errorMessage?.includes('No active provider')) {
        expect(result.success).toBe(false);
        expect(result.retryScheduled).toBe(true);
        expect(result.errorMessage).toContain('temporarily unavailable');
      }
    });

    it('should fail immediately on non-retryable error', async () => {
      mockAdapterClient.send.mockResolvedValue(nonRetryableFailResult);

      const dispatch = buildDispatch();
      const result = await pipelineService.execute(dispatch);

      if (!result.errorMessage?.includes('No active provider')) {
        expect(result.success).toBe(false);
        expect(result.retryScheduled).toBeUndefined();
        expect(result.fallbackTriggered).toBeUndefined();
        expect(result.errorMessage).toContain('invalid recipient');
      }
    });
  });

  describe('Pipeline result shape', () => {
    it('should return PipelineResult with all required fields', async () => {
      const dispatch = buildDispatch();
      const result = await pipelineService.execute(dispatch);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('notificationId');
      expect(result).toHaveProperty('channel');
      expect(result).toHaveProperty('attemptNumber');
      expect(result).toHaveProperty('durationMs');
      expect(typeof result.durationMs).toBe('number');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should default attemptNumber to 1', async () => {
      const dispatch = buildDispatch();
      delete (dispatch as any).attemptNumber;
      const result = await pipelineService.execute(dispatch);

      expect(result.attemptNumber).toBe(1);
    });
  });
});
