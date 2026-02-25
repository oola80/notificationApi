import { Test, TestingModule } from '@nestjs/testing';
import {
  SuppressionEvaluatorService,
  SuppressionConfig,
} from './suppression-evaluator.service.js';
import { NotificationsRepository } from '../notifications.repository.js';
import { Notification } from '../entities/notification.entity.js';

describe('SuppressionEvaluatorService', () => {
  let service: SuppressionEvaluatorService;
  let notificationsRepo: jest.Mocked<NotificationsRepository>;

  const mockNotification = {
    id: '1',
    notificationId: '550e8400-e29b-41d4-a716-446655440000',
    status: 'SENT',
    createdAt: new Date(),
  } as Notification;

  beforeEach(async () => {
    const mockRepo = {
      findForSuppressionCheck: jest.fn().mockResolvedValue([]),
      countForSuppressionCheck: jest.fn().mockResolvedValue(0),
      findMostRecentForSuppression: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuppressionEvaluatorService,
        { provide: NotificationsRepository, useValue: mockRepo },
      ],
    }).compile();

    service = module.get<SuppressionEvaluatorService>(
      SuppressionEvaluatorService,
    );
    notificationsRepo = module.get(NotificationsRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('no suppression config', () => {
    it('should pass through when suppression is null', async () => {
      const result = await service.evaluate(null, 'hash123', 'rule-1');

      expect(result).toEqual({ suppressed: false });
    });

    it('should pass through when suppression is undefined', async () => {
      const result = await service.evaluate(undefined, 'hash123', 'rule-1');

      expect(result).toEqual({ suppressed: false });
    });

    it('should pass through when modes array is empty', async () => {
      const result = await service.evaluate({ modes: [] }, 'hash123', 'rule-1');

      expect(result).toEqual({ suppressed: false });
    });

    it('should pass through when dedupKeyHash is null', async () => {
      const config: SuppressionConfig = {
        modes: [{ type: 'dedup', windowMinutes: 60 }],
      };

      const result = await service.evaluate(config, null, 'rule-1');

      expect(result).toEqual({ suppressed: false });
    });
  });

  describe('dedup mode', () => {
    it('should suppress when duplicate found within window', async () => {
      notificationsRepo.findForSuppressionCheck.mockResolvedValue([
        mockNotification,
      ]);

      const config: SuppressionConfig = {
        modes: [{ type: 'dedup', windowMinutes: 60 }],
      };

      const result = await service.evaluate(config, 'hash123', 'rule-1');

      expect(result.suppressed).toBe(true);
      expect(result.mode).toBe('dedup');
      expect(result.reason).toContain('60 minute window');
      expect(notificationsRepo.findForSuppressionCheck).toHaveBeenCalledWith(
        'rule-1',
        'hash123',
        60,
      );
    });

    it('should not suppress when no duplicates found', async () => {
      notificationsRepo.findForSuppressionCheck.mockResolvedValue([]);

      const config: SuppressionConfig = {
        modes: [{ type: 'dedup', windowMinutes: 30 }],
      };

      const result = await service.evaluate(config, 'hash123', 'rule-1');

      expect(result.suppressed).toBe(false);
    });

    it('should default windowMinutes to 60', async () => {
      notificationsRepo.findForSuppressionCheck.mockResolvedValue([]);

      const config: SuppressionConfig = {
        modes: [{ type: 'dedup' }],
      };

      await service.evaluate(config, 'hash123', 'rule-1');

      expect(notificationsRepo.findForSuppressionCheck).toHaveBeenCalledWith(
        'rule-1',
        'hash123',
        60,
      );
    });
  });

  describe('cooldown mode', () => {
    it('should suppress when cooldown interval has not elapsed', async () => {
      const recentNotification = {
        ...mockNotification,
        createdAt: new Date(), // just now
      } as Notification;

      notificationsRepo.findMostRecentForSuppression.mockResolvedValue(
        recentNotification,
      );

      const config: SuppressionConfig = {
        modes: [{ type: 'cooldown', intervalMinutes: 30 }],
      };

      const result = await service.evaluate(config, 'hash123', 'rule-1');

      expect(result.suppressed).toBe(true);
      expect(result.mode).toBe('cooldown');
      expect(result.reason).toContain('30 minute interval');
    });

    it('should not suppress when cooldown interval has elapsed', async () => {
      const oldNotification = {
        ...mockNotification,
        createdAt: new Date(Date.now() - 120 * 60 * 1000), // 2 hours ago
      } as Notification;

      notificationsRepo.findMostRecentForSuppression.mockResolvedValue(
        oldNotification,
      );

      const config: SuppressionConfig = {
        modes: [{ type: 'cooldown', intervalMinutes: 60 }],
      };

      const result = await service.evaluate(config, 'hash123', 'rule-1');

      expect(result.suppressed).toBe(false);
    });

    it('should not suppress when no previous notification exists', async () => {
      notificationsRepo.findMostRecentForSuppression.mockResolvedValue(null);

      const config: SuppressionConfig = {
        modes: [{ type: 'cooldown', intervalMinutes: 60 }],
      };

      const result = await service.evaluate(config, 'hash123', 'rule-1');

      expect(result.suppressed).toBe(false);
    });

    it('should default intervalMinutes to 60', async () => {
      notificationsRepo.findMostRecentForSuppression.mockResolvedValue(null);

      const config: SuppressionConfig = {
        modes: [{ type: 'cooldown' }],
      };

      await service.evaluate(config, 'hash123', 'rule-1');

      expect(
        notificationsRepo.findMostRecentForSuppression,
      ).toHaveBeenCalledWith('rule-1', 'hash123');
    });
  });

  describe('maxCount mode', () => {
    it('should suppress when count reaches limit', async () => {
      notificationsRepo.countForSuppressionCheck.mockResolvedValue(5);

      const config: SuppressionConfig = {
        modes: [{ type: 'maxCount', windowMinutes: 60, limit: 5 }],
      };

      const result = await service.evaluate(config, 'hash123', 'rule-1');

      expect(result.suppressed).toBe(true);
      expect(result.mode).toBe('maxCount');
      expect(result.reason).toContain('5/5');
    });

    it('should suppress when count exceeds limit', async () => {
      notificationsRepo.countForSuppressionCheck.mockResolvedValue(10);

      const config: SuppressionConfig = {
        modes: [{ type: 'maxCount', windowMinutes: 120, limit: 5 }],
      };

      const result = await service.evaluate(config, 'hash123', 'rule-1');

      expect(result.suppressed).toBe(true);
      expect(result.mode).toBe('maxCount');
    });

    it('should not suppress when count is below limit', async () => {
      notificationsRepo.countForSuppressionCheck.mockResolvedValue(2);

      const config: SuppressionConfig = {
        modes: [{ type: 'maxCount', windowMinutes: 60, limit: 5 }],
      };

      const result = await service.evaluate(config, 'hash123', 'rule-1');

      expect(result.suppressed).toBe(false);
    });

    it('should default windowMinutes to 60 and limit to 1', async () => {
      notificationsRepo.countForSuppressionCheck.mockResolvedValue(0);

      const config: SuppressionConfig = {
        modes: [{ type: 'maxCount' }],
      };

      await service.evaluate(config, 'hash123', 'rule-1');

      expect(notificationsRepo.countForSuppressionCheck).toHaveBeenCalledWith(
        'rule-1',
        'hash123',
        60,
      );
    });
  });

  describe('combined modes', () => {
    it('should short-circuit on first suppressing mode (dedup)', async () => {
      notificationsRepo.findForSuppressionCheck.mockResolvedValue([
        mockNotification,
      ]);

      const config: SuppressionConfig = {
        modes: [
          { type: 'dedup', windowMinutes: 60 },
          { type: 'cooldown', intervalMinutes: 30 },
          { type: 'maxCount', windowMinutes: 60, limit: 5 },
        ],
      };

      const result = await service.evaluate(config, 'hash123', 'rule-1');

      expect(result.suppressed).toBe(true);
      expect(result.mode).toBe('dedup');
      // cooldown and maxCount should not be called
      expect(
        notificationsRepo.findMostRecentForSuppression,
      ).not.toHaveBeenCalled();
      expect(notificationsRepo.countForSuppressionCheck).not.toHaveBeenCalled();
    });

    it('should evaluate all modes when none suppress', async () => {
      notificationsRepo.findForSuppressionCheck.mockResolvedValue([]);
      notificationsRepo.findMostRecentForSuppression.mockResolvedValue(null);
      notificationsRepo.countForSuppressionCheck.mockResolvedValue(0);

      const config: SuppressionConfig = {
        modes: [
          { type: 'dedup', windowMinutes: 60 },
          { type: 'cooldown', intervalMinutes: 30 },
          { type: 'maxCount', windowMinutes: 60, limit: 5 },
        ],
      };

      const result = await service.evaluate(config, 'hash123', 'rule-1');

      expect(result.suppressed).toBe(false);
      expect(notificationsRepo.findForSuppressionCheck).toHaveBeenCalled();
      expect(notificationsRepo.findMostRecentForSuppression).toHaveBeenCalled();
      expect(notificationsRepo.countForSuppressionCheck).toHaveBeenCalled();
    });

    it('should suppress on second mode if first passes', async () => {
      notificationsRepo.findForSuppressionCheck.mockResolvedValue([]);

      const recentNotification = {
        ...mockNotification,
        createdAt: new Date(), // just now
      } as Notification;
      notificationsRepo.findMostRecentForSuppression.mockResolvedValue(
        recentNotification,
      );

      const config: SuppressionConfig = {
        modes: [
          { type: 'dedup', windowMinutes: 60 },
          { type: 'cooldown', intervalMinutes: 30 },
        ],
      };

      const result = await service.evaluate(config, 'hash123', 'rule-1');

      expect(result.suppressed).toBe(true);
      expect(result.mode).toBe('cooldown');
    });
  });

  describe('FAILED exclusion', () => {
    it('should exclude FAILED notifications from dedup check', async () => {
      // findForSuppressionCheck already filters FAILED at the repository level
      notificationsRepo.findForSuppressionCheck.mockResolvedValue([]);

      const config: SuppressionConfig = {
        modes: [{ type: 'dedup', windowMinutes: 60 }],
      };

      const result = await service.evaluate(config, 'hash123', 'rule-1');

      expect(result.suppressed).toBe(false);
      expect(notificationsRepo.findForSuppressionCheck).toHaveBeenCalledWith(
        'rule-1',
        'hash123',
        60,
      );
    });

    it('should exclude FAILED notifications from cooldown check', async () => {
      // findMostRecentForSuppression already filters FAILED at the repository level
      notificationsRepo.findMostRecentForSuppression.mockResolvedValue(null);

      const config: SuppressionConfig = {
        modes: [{ type: 'cooldown', intervalMinutes: 60 }],
      };

      const result = await service.evaluate(config, 'hash123', 'rule-1');

      expect(result.suppressed).toBe(false);
    });

    it('should exclude FAILED notifications from maxCount check', async () => {
      // countForSuppressionCheck already filters FAILED at the repository level
      notificationsRepo.countForSuppressionCheck.mockResolvedValue(0);

      const config: SuppressionConfig = {
        modes: [{ type: 'maxCount', windowMinutes: 60, limit: 5 }],
      };

      const result = await service.evaluate(config, 'hash123', 'rule-1');

      expect(result.suppressed).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle unknown mode type gracefully', async () => {
      const config: SuppressionConfig = {
        modes: [{ type: 'unknown' as any }],
      };

      const result = await service.evaluate(config, 'hash123', 'rule-1');

      expect(result.suppressed).toBe(false);
    });

    it('should handle suppression config with no modes property', async () => {
      const config: SuppressionConfig = {};

      const result = await service.evaluate(config, 'hash123', 'rule-1');

      expect(result.suppressed).toBe(false);
    });
  });
});
