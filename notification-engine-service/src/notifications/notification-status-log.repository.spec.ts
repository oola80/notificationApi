import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationStatusLogRepository } from './notification-status-log.repository.js';
import { NotificationStatusLog } from './entities/notification-status-log.entity.js';

describe('NotificationStatusLogRepository', () => {
  let repository: NotificationStatusLogRepository;
  let mockTypeOrmRepo: any;

  const mockLogEntry: NotificationStatusLog = {
    id: '1',
    notificationId: '550e8400-e29b-41d4-a716-446655440000',
    fromStatus: null,
    toStatus: 'PENDING',
    channel: 'email',
    metadata: null,
    createdAt: new Date('2026-02-24T10:00:00Z'),
  };

  beforeEach(async () => {
    mockTypeOrmRepo = {
      find: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationStatusLogRepository,
        {
          provide: getRepositoryToken(NotificationStatusLog),
          useValue: mockTypeOrmRepo,
        },
      ],
    }).compile();

    repository = module.get<NotificationStatusLogRepository>(
      NotificationStatusLogRepository,
    );
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('createLogEntry', () => {
    it('should create a log entry with all fields', async () => {
      mockTypeOrmRepo.create.mockReturnValue(mockLogEntry);
      mockTypeOrmRepo.save.mockResolvedValue(mockLogEntry);

      const result = await repository.createLogEntry(
        '550e8400-e29b-41d4-a716-446655440000',
        null,
        'PENDING',
        'email',
        { reason: 'initial' },
      );

      expect(result).toEqual(mockLogEntry);
      expect(mockTypeOrmRepo.create).toHaveBeenCalledWith({
        notificationId: '550e8400-e29b-41d4-a716-446655440000',
        fromStatus: null,
        toStatus: 'PENDING',
        channel: 'email',
        metadata: { reason: 'initial' },
      });
    });

    it('should create a log entry with minimal fields', async () => {
      mockTypeOrmRepo.create.mockReturnValue(mockLogEntry);
      mockTypeOrmRepo.save.mockResolvedValue(mockLogEntry);

      await repository.createLogEntry(
        '550e8400-e29b-41d4-a716-446655440000',
        'PENDING',
        'PROCESSING',
      );

      expect(mockTypeOrmRepo.create).toHaveBeenCalledWith({
        notificationId: '550e8400-e29b-41d4-a716-446655440000',
        fromStatus: 'PENDING',
        toStatus: 'PROCESSING',
        channel: null,
        metadata: null,
      });
    });
  });

  describe('findByNotificationId', () => {
    it('should return log entries ordered by createdAt ASC', async () => {
      const entries = [
        mockLogEntry,
        { ...mockLogEntry, id: '2', toStatus: 'PROCESSING' },
      ];
      mockTypeOrmRepo.find.mockResolvedValue(entries);

      const result = await repository.findByNotificationId(
        mockLogEntry.notificationId,
      );

      expect(result).toEqual(entries);
      expect(mockTypeOrmRepo.find).toHaveBeenCalledWith({
        where: { notificationId: mockLogEntry.notificationId },
        order: { createdAt: 'ASC' },
      });
    });

    it('should return empty array when no entries found', async () => {
      mockTypeOrmRepo.find.mockResolvedValue([]);

      const result = await repository.findByNotificationId('nonexistent');

      expect(result).toEqual([]);
    });
  });
});
