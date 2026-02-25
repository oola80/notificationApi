import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import {
  CircuitBreakerService,
  CircuitState,
} from './circuit-breaker.service.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { createErrorResponse } from '../common/errors.js';

describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;
  let metricsService: jest.Mocked<MetricsService>;

  const THRESHOLD = 3;
  const RESET_MS = 5000;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CircuitBreakerService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config: Record<string, any> = {
                'app.templateServiceCbThreshold': THRESHOLD,
                'app.templateServiceCbResetMs': RESET_MS,
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
        {
          provide: MetricsService,
          useValue: {
            setTemplateServiceCircuitState: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CircuitBreakerService>(CircuitBreakerService);
    metricsService = module.get(MetricsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should start in CLOSED state', () => {
    expect(service.getState()).toBe(CircuitState.CLOSED);
  });

  it('should report initial state on module init', () => {
    service.onModuleInit();
    expect(metricsService.setTemplateServiceCircuitState).toHaveBeenCalledWith(
      CircuitState.CLOSED,
    );
  });

  it('should execute function successfully when CLOSED', async () => {
    const result = await service.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
    expect(service.getState()).toBe(CircuitState.CLOSED);
  });

  it('should track failures but stay CLOSED below threshold', async () => {
    for (let i = 0; i < THRESHOLD - 1; i++) {
      await expect(
        service.execute(() => Promise.reject(new Error('fail'))),
      ).rejects.toThrow('fail');
    }
    expect(service.getState()).toBe(CircuitState.CLOSED);
  });

  it('should transition to OPEN when failures reach threshold', async () => {
    for (let i = 0; i < THRESHOLD; i++) {
      await expect(
        service.execute(() => Promise.reject(new Error('fail'))),
      ).rejects.toThrow('fail');
    }
    expect(service.getState()).toBe(CircuitState.OPEN);
    expect(metricsService.setTemplateServiceCircuitState).toHaveBeenCalledWith(
      CircuitState.OPEN,
    );
  });

  it('should reject immediately with NES-020 when OPEN', async () => {
    // Force to OPEN
    for (let i = 0; i < THRESHOLD; i++) {
      await expect(
        service.execute(() => Promise.reject(new Error('fail'))),
      ).rejects.toThrow();
    }
    expect(service.getState()).toBe(CircuitState.OPEN);

    try {
      await service.execute(() => Promise.resolve('should not run'));
      fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      const response = (error as HttpException).getResponse() as any;
      expect(response.code).toBe('NES-020');
    }
  });

  it('should transition to HALF_OPEN after reset timeout', async () => {
    // Force to OPEN
    for (let i = 0; i < THRESHOLD; i++) {
      await expect(
        service.execute(() => Promise.reject(new Error('fail'))),
      ).rejects.toThrow();
    }
    expect(service.getState()).toBe(CircuitState.OPEN);

    // Simulate time passing beyond resetMs
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + RESET_MS + 1);

    const result = await service.execute(() => Promise.resolve('probe'));
    expect(result).toBe('probe');
    expect(service.getState()).toBe(CircuitState.CLOSED);

    jest.restoreAllMocks();
  });

  it('should close circuit on successful probe in HALF_OPEN', async () => {
    // Force to OPEN
    for (let i = 0; i < THRESHOLD; i++) {
      await expect(
        service.execute(() => Promise.reject(new Error('fail'))),
      ).rejects.toThrow();
    }

    // Simulate timeout elapsed
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + RESET_MS + 1);

    await service.execute(() => Promise.resolve('ok'));
    expect(service.getState()).toBe(CircuitState.CLOSED);
    expect(metricsService.setTemplateServiceCircuitState).toHaveBeenCalledWith(
      CircuitState.CLOSED,
    );

    jest.restoreAllMocks();
  });

  it('should re-open circuit on failed probe in HALF_OPEN', async () => {
    // Force to OPEN
    for (let i = 0; i < THRESHOLD; i++) {
      await expect(
        service.execute(() => Promise.reject(new Error('fail'))),
      ).rejects.toThrow();
    }

    // Simulate timeout elapsed
    const openedAt = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(openedAt + RESET_MS + 1);

    await expect(
      service.execute(() => Promise.reject(new Error('still failing'))),
    ).rejects.toThrow('still failing');
    expect(service.getState()).toBe(CircuitState.OPEN);

    jest.restoreAllMocks();
  });

  it('should reset failure counter on success', async () => {
    // Accumulate failures just below threshold
    for (let i = 0; i < THRESHOLD - 1; i++) {
      await expect(
        service.execute(() => Promise.reject(new Error('fail'))),
      ).rejects.toThrow();
    }

    // Success resets counter
    await service.execute(() => Promise.resolve('ok'));
    expect(service.getState()).toBe(CircuitState.CLOSED);

    // Failures should start from 0 again
    for (let i = 0; i < THRESHOLD - 1; i++) {
      await expect(
        service.execute(() => Promise.reject(new Error('fail'))),
      ).rejects.toThrow();
    }
    expect(service.getState()).toBe(CircuitState.CLOSED);
  });

  it('should NOT treat NES-019 (template not found) as a service failure', async () => {
    for (let i = 0; i < THRESHOLD + 1; i++) {
      await expect(
        service.execute(() => {
          throw createErrorResponse('NES-019', 'Template not found');
        }),
      ).rejects.toThrow();
    }
    // Should still be CLOSED because NES-019 is a business error
    expect(service.getState()).toBe(CircuitState.CLOSED);
  });

  it('should treat NES-018 (render failed) as a service failure', async () => {
    for (let i = 0; i < THRESHOLD; i++) {
      await expect(
        service.execute(() => {
          throw createErrorResponse('NES-018');
        }),
      ).rejects.toThrow();
    }
    expect(service.getState()).toBe(CircuitState.OPEN);
  });

  it('should update metrics gauge on every state transition', async () => {
    metricsService.setTemplateServiceCircuitState.mockClear();

    // CLOSED → OPEN
    for (let i = 0; i < THRESHOLD; i++) {
      await expect(
        service.execute(() => Promise.reject(new Error('fail'))),
      ).rejects.toThrow();
    }
    expect(metricsService.setTemplateServiceCircuitState).toHaveBeenCalledWith(
      CircuitState.OPEN,
    );

    // OPEN → HALF_OPEN → CLOSED (via successful probe)
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + RESET_MS + 1);
    metricsService.setTemplateServiceCircuitState.mockClear();

    await service.execute(() => Promise.resolve('ok'));
    // HALF_OPEN transition + CLOSED transition
    expect(metricsService.setTemplateServiceCircuitState).toHaveBeenCalledWith(
      CircuitState.HALF_OPEN,
    );
    expect(metricsService.setTemplateServiceCircuitState).toHaveBeenCalledWith(
      CircuitState.CLOSED,
    );

    jest.restoreAllMocks();
  });
});
