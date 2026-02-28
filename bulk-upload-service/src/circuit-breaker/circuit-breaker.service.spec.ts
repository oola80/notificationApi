import { ConfigService } from '@nestjs/config';
import {
  CircuitBreakerService,
  CircuitBreakerState,
} from './circuit-breaker.service.js';

describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;
  let configService: jest.Mocked<ConfigService>;

  const DEFAULT_THRESHOLD = 3;
  const DEFAULT_COOLDOWN_MS = 30000;

  beforeEach(() => {
    configService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          'app.circuitBreakerThreshold': DEFAULT_THRESHOLD,
          'app.circuitBreakerCooldownMs': DEFAULT_COOLDOWN_MS,
        };
        return config[key] ?? defaultValue;
      }),
    } as any;

    service = new CircuitBreakerService(configService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should start in CLOSED state', () => {
      expect(service.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should start with zero consecutive failures', () => {
      expect(service.getConsecutiveFailures()).toBe(0);
    });

    it('should read threshold from config', () => {
      expect(configService.get).toHaveBeenCalledWith(
        'app.circuitBreakerThreshold',
        3,
      );
    });

    it('should read cooldown from config', () => {
      expect(configService.get).toHaveBeenCalledWith(
        'app.circuitBreakerCooldownMs',
        30000,
      );
    });

    it('should use custom config values when provided', () => {
      const customConfig = {
        get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
          const config: Record<string, any> = {
            'app.circuitBreakerThreshold': 5,
            'app.circuitBreakerCooldownMs': 60000,
          };
          return config[key] ?? defaultValue;
        }),
      } as any;

      const customService = new CircuitBreakerService(customConfig);

      expect(customService.getCooldownMs()).toBe(60000);
    });
  });

  describe('canExecute', () => {
    it('should return true when CLOSED', () => {
      expect(service.canExecute()).toBe(true);
    });

    it('should return false when OPEN and cooldown has not elapsed', () => {
      // Trip the circuit
      for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
        service.recordFailure();
      }
      expect(service.getState()).toBe(CircuitBreakerState.OPEN);
      expect(service.canExecute()).toBe(false);
    });

    it('should return true and transition to HALF_OPEN after cooldown elapsed', () => {
      // Trip the circuit
      for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
        service.recordFailure();
      }
      expect(service.getState()).toBe(CircuitBreakerState.OPEN);

      // Simulate cooldown elapsed
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + DEFAULT_COOLDOWN_MS);

      expect(service.canExecute()).toBe(true);
      expect(service.getState()).toBe(CircuitBreakerState.HALF_OPEN);
    });

    it('should return true when already in HALF_OPEN state', () => {
      // Trip the circuit then let cooldown elapse
      for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
        service.recordFailure();
      }
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + DEFAULT_COOLDOWN_MS);
      service.canExecute(); // transitions to HALF_OPEN

      expect(service.getState()).toBe(CircuitBreakerState.HALF_OPEN);
      expect(service.canExecute()).toBe(true);
    });

    it('should return false when OPEN and cooldown is partially elapsed', () => {
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
        service.recordFailure();
      }

      // Advance time by half the cooldown
      jest.spyOn(Date, 'now').mockReturnValue(now + DEFAULT_COOLDOWN_MS / 2);
      expect(service.canExecute()).toBe(false);
      expect(service.getState()).toBe(CircuitBreakerState.OPEN);
    });
  });

  describe('recordSuccess', () => {
    it('should keep state CLOSED when already CLOSED', () => {
      service.recordSuccess();
      expect(service.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(service.getConsecutiveFailures()).toBe(0);
    });

    it('should reset consecutive failures to zero', () => {
      // Record some failures (below threshold)
      service.recordFailure();
      service.recordFailure();
      expect(service.getConsecutiveFailures()).toBe(2);

      service.recordSuccess();
      expect(service.getConsecutiveFailures()).toBe(0);
    });

    it('should transition from HALF_OPEN to CLOSED', () => {
      // Trip circuit, let cooldown elapse to enter HALF_OPEN
      for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
        service.recordFailure();
      }
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + DEFAULT_COOLDOWN_MS);
      service.canExecute(); // transitions to HALF_OPEN
      expect(service.getState()).toBe(CircuitBreakerState.HALF_OPEN);

      service.recordSuccess();
      expect(service.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(service.getConsecutiveFailures()).toBe(0);
    });

    it('should transition from OPEN to CLOSED', () => {
      for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
        service.recordFailure();
      }
      expect(service.getState()).toBe(CircuitBreakerState.OPEN);

      service.recordSuccess();
      expect(service.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(service.getConsecutiveFailures()).toBe(0);
    });

    it('should clear lastFailureTime so getTimeUntilRetry returns 0', () => {
      service.recordFailure();
      service.recordSuccess();
      expect(service.getTimeUntilRetry()).toBe(0);
    });

    it('should not accumulate failures after a success resets the counter', () => {
      // Record 2 failures
      service.recordFailure();
      service.recordFailure();
      expect(service.getConsecutiveFailures()).toBe(2);

      // Success resets
      service.recordSuccess();
      expect(service.getConsecutiveFailures()).toBe(0);

      // Record 2 more failures — should not trip (threshold is 3)
      service.recordFailure();
      service.recordFailure();
      expect(service.getConsecutiveFailures()).toBe(2);
      expect(service.getState()).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe('recordFailure', () => {
    it('should increment consecutive failures counter', () => {
      service.recordFailure();
      expect(service.getConsecutiveFailures()).toBe(1);
    });

    it('should increment counter on each call', () => {
      service.recordFailure();
      service.recordFailure();
      expect(service.getConsecutiveFailures()).toBe(2);
    });

    it('should stay CLOSED when failures are below threshold', () => {
      for (let i = 0; i < DEFAULT_THRESHOLD - 1; i++) {
        service.recordFailure();
      }
      expect(service.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(service.getConsecutiveFailures()).toBe(DEFAULT_THRESHOLD - 1);
    });

    it('should transition to OPEN when failures reach threshold', () => {
      for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
        service.recordFailure();
      }
      expect(service.getState()).toBe(CircuitBreakerState.OPEN);
      expect(service.getConsecutiveFailures()).toBe(DEFAULT_THRESHOLD);
    });

    it('should transition to OPEN when failures exceed threshold', () => {
      for (let i = 0; i < DEFAULT_THRESHOLD + 2; i++) {
        service.recordFailure();
      }
      expect(service.getState()).toBe(CircuitBreakerState.OPEN);
      expect(service.getConsecutiveFailures()).toBe(DEFAULT_THRESHOLD + 2);
    });

    it('should transition from HALF_OPEN directly to OPEN on first failure', () => {
      // Enter HALF_OPEN
      for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
        service.recordFailure();
      }
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + DEFAULT_COOLDOWN_MS);
      service.canExecute(); // transitions to HALF_OPEN
      expect(service.getState()).toBe(CircuitBreakerState.HALF_OPEN);

      // Reset the Date.now mock to current-ish time for the failure recording
      jest.restoreAllMocks();

      // A single failure in HALF_OPEN trips back to OPEN immediately
      service.recordFailure();
      expect(service.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('should update lastFailureTime on each failure', () => {
      const time1 = 1000000;
      const time2 = 2000000;

      jest.spyOn(Date, 'now').mockReturnValue(time1);
      service.recordFailure();
      const remaining1 = service.getTimeUntilRetry();

      jest.spyOn(Date, 'now').mockReturnValue(time2);
      service.recordFailure();
      service.recordFailure(); // trip to OPEN

      // getTimeUntilRetry is calculated from the LAST failure time
      // At time2 the remaining should be full cooldown
      expect(service.getTimeUntilRetry()).toBe(DEFAULT_COOLDOWN_MS);
    });
  });

  describe('getState', () => {
    it('should return CLOSED initially', () => {
      expect(service.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should return OPEN after threshold failures', () => {
      for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
        service.recordFailure();
      }
      expect(service.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('should return HALF_OPEN after cooldown elapses on OPEN circuit', () => {
      for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
        service.recordFailure();
      }
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + DEFAULT_COOLDOWN_MS);
      service.canExecute();
      expect(service.getState()).toBe(CircuitBreakerState.HALF_OPEN);
    });
  });

  describe('getConsecutiveFailures', () => {
    it('should return 0 initially', () => {
      expect(service.getConsecutiveFailures()).toBe(0);
    });

    it('should return correct count after multiple failures', () => {
      service.recordFailure();
      service.recordFailure();
      service.recordFailure();
      expect(service.getConsecutiveFailures()).toBe(3);
    });

    it('should return 0 after reset', () => {
      service.recordFailure();
      service.recordFailure();
      service.reset();
      expect(service.getConsecutiveFailures()).toBe(0);
    });
  });

  describe('getCooldownMs', () => {
    it('should return configured cooldown value', () => {
      expect(service.getCooldownMs()).toBe(DEFAULT_COOLDOWN_MS);
    });

    it('should return custom cooldown when configured differently', () => {
      const customConfig = {
        get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
          const config: Record<string, any> = {
            'app.circuitBreakerThreshold': 5,
            'app.circuitBreakerCooldownMs': 15000,
          };
          return config[key] ?? defaultValue;
        }),
      } as any;

      const customService = new CircuitBreakerService(customConfig);
      expect(customService.getCooldownMs()).toBe(15000);
    });
  });

  describe('getTimeUntilRetry', () => {
    it('should return 0 when state is CLOSED', () => {
      expect(service.getTimeUntilRetry()).toBe(0);
    });

    it('should return 0 when state is HALF_OPEN', () => {
      // Enter HALF_OPEN
      for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
        service.recordFailure();
      }
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + DEFAULT_COOLDOWN_MS);
      service.canExecute(); // transitions to HALF_OPEN

      expect(service.getTimeUntilRetry()).toBe(0);
    });

    it('should return remaining cooldown time when OPEN', () => {
      const baseTime = 1000000;
      jest.spyOn(Date, 'now').mockReturnValue(baseTime);

      for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
        service.recordFailure();
      }
      expect(service.getState()).toBe(CircuitBreakerState.OPEN);

      // Simulate 10 seconds elapsed
      const elapsedMs = 10000;
      jest.spyOn(Date, 'now').mockReturnValue(baseTime + elapsedMs);

      const remaining = service.getTimeUntilRetry();
      expect(remaining).toBe(DEFAULT_COOLDOWN_MS - elapsedMs);
    });

    it('should return 0 when cooldown has fully elapsed (but canExecute not yet called)', () => {
      const baseTime = 1000000;
      jest.spyOn(Date, 'now').mockReturnValue(baseTime);

      for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
        service.recordFailure();
      }

      // Advance past cooldown
      jest
        .spyOn(Date, 'now')
        .mockReturnValue(baseTime + DEFAULT_COOLDOWN_MS + 1000);

      // State is still OPEN (canExecute not called), but time exceeded cooldown
      // Math.max(0, cooldown - elapsed) = 0
      expect(service.getTimeUntilRetry()).toBe(0);
    });

    it('should return 0 after recordSuccess clears failure state', () => {
      for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
        service.recordFailure();
      }
      expect(service.getState()).toBe(CircuitBreakerState.OPEN);

      service.recordSuccess();
      expect(service.getTimeUntilRetry()).toBe(0);
    });
  });

  describe('reset', () => {
    it('should reset state to CLOSED from OPEN', () => {
      for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
        service.recordFailure();
      }
      expect(service.getState()).toBe(CircuitBreakerState.OPEN);

      service.reset();
      expect(service.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should reset state to CLOSED from HALF_OPEN', () => {
      for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
        service.recordFailure();
      }
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + DEFAULT_COOLDOWN_MS);
      service.canExecute(); // transitions to HALF_OPEN

      service.reset();
      expect(service.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should reset consecutive failures to zero', () => {
      service.recordFailure();
      service.recordFailure();
      service.reset();
      expect(service.getConsecutiveFailures()).toBe(0);
    });

    it('should clear lastFailureTime', () => {
      for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
        service.recordFailure();
      }
      service.reset();
      expect(service.getTimeUntilRetry()).toBe(0);
    });

    it('should allow circuit to function normally after reset', () => {
      // Trip the circuit
      for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
        service.recordFailure();
      }
      expect(service.getState()).toBe(CircuitBreakerState.OPEN);
      expect(service.canExecute()).toBe(false);

      // Reset
      service.reset();
      expect(service.canExecute()).toBe(true);

      // Verify it can trip again
      for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
        service.recordFailure();
      }
      expect(service.getState()).toBe(CircuitBreakerState.OPEN);
    });
  });

  describe('full lifecycle', () => {
    it('should follow CLOSED → OPEN → HALF_OPEN → CLOSED on recovery', () => {
      // Start CLOSED
      expect(service.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(service.canExecute()).toBe(true);

      // Trip to OPEN
      for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
        service.recordFailure();
      }
      expect(service.getState()).toBe(CircuitBreakerState.OPEN);
      expect(service.canExecute()).toBe(false);

      // Cooldown elapses → HALF_OPEN
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + DEFAULT_COOLDOWN_MS);
      expect(service.canExecute()).toBe(true);
      expect(service.getState()).toBe(CircuitBreakerState.HALF_OPEN);

      // Probe succeeds → CLOSED
      service.recordSuccess();
      expect(service.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(service.getConsecutiveFailures()).toBe(0);
      expect(service.canExecute()).toBe(true);
    });

    it('should follow CLOSED → OPEN → HALF_OPEN → OPEN on probe failure', () => {
      // Trip to OPEN
      for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
        service.recordFailure();
      }
      expect(service.getState()).toBe(CircuitBreakerState.OPEN);

      // Cooldown elapses → HALF_OPEN
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + DEFAULT_COOLDOWN_MS);
      service.canExecute();
      expect(service.getState()).toBe(CircuitBreakerState.HALF_OPEN);

      // Probe fails → back to OPEN
      jest.restoreAllMocks();
      service.recordFailure();
      expect(service.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('should handle interleaved successes and failures correctly', () => {
      // Fail twice (below threshold)
      service.recordFailure();
      service.recordFailure();
      expect(service.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(service.getConsecutiveFailures()).toBe(2);

      // Success resets
      service.recordSuccess();
      expect(service.getConsecutiveFailures()).toBe(0);
      expect(service.getState()).toBe(CircuitBreakerState.CLOSED);

      // Fail once — should not trip
      service.recordFailure();
      expect(service.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(service.getConsecutiveFailures()).toBe(1);

      // Success again
      service.recordSuccess();
      expect(service.getConsecutiveFailures()).toBe(0);

      // Now trip with 3 consecutive
      service.recordFailure();
      service.recordFailure();
      service.recordFailure();
      expect(service.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('should handle multiple HALF_OPEN → OPEN → HALF_OPEN cycles', () => {
      const baseTime = Date.now();

      // Trip the circuit
      jest.spyOn(Date, 'now').mockReturnValue(baseTime);
      for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
        service.recordFailure();
      }
      expect(service.getState()).toBe(CircuitBreakerState.OPEN);

      // First cooldown → HALF_OPEN
      jest
        .spyOn(Date, 'now')
        .mockReturnValue(baseTime + DEFAULT_COOLDOWN_MS);
      service.canExecute();
      expect(service.getState()).toBe(CircuitBreakerState.HALF_OPEN);

      // Probe fails → back to OPEN
      const failTime1 = baseTime + DEFAULT_COOLDOWN_MS + 100;
      jest.spyOn(Date, 'now').mockReturnValue(failTime1);
      service.recordFailure();
      expect(service.getState()).toBe(CircuitBreakerState.OPEN);

      // Second cooldown → HALF_OPEN again
      jest
        .spyOn(Date, 'now')
        .mockReturnValue(failTime1 + DEFAULT_COOLDOWN_MS);
      service.canExecute();
      expect(service.getState()).toBe(CircuitBreakerState.HALF_OPEN);

      // Probe succeeds → CLOSED
      service.recordSuccess();
      expect(service.getState()).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe('CircuitBreakerState enum', () => {
    it('should have CLOSED value', () => {
      expect(CircuitBreakerState.CLOSED).toBe('CLOSED');
    });

    it('should have OPEN value', () => {
      expect(CircuitBreakerState.OPEN).toBe('OPEN');
    });

    it('should have HALF_OPEN value', () => {
      expect(CircuitBreakerState.HALF_OPEN).toBe('HALF_OPEN');
    });
  });
});
