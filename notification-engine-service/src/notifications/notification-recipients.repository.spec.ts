import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationRecipientsRepository } from './notification-recipients.repository.js';
import { NotificationRecipient } from './entities/notification-recipient.entity.js';

describe('NotificationRecipientsRepository', () => {
  let repository: NotificationRecipientsRepository;
  let mockTypeOrmRepo: any;

  const mockRecipient: NotificationRecipient = {
    id: '1',
    notificationId: '550e8400-e29b-41d4-a716-446655440000',
    recipientType: 'customer',
    email: 'test@example.com',
    phone: null,
    deviceToken: null,
    memberName: 'Test User',
    status: 'PENDING',
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
        NotificationRecipientsRepository,
        {
          provide: getRepositoryToken(NotificationRecipient),
          useValue: mockTypeOrmRepo,
        },
      ],
    }).compile();

    repository = module.get<NotificationRecipientsRepository>(
      NotificationRecipientsRepository,
    );
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('createBatch', () => {
    it('should create and save multiple recipients', async () => {
      const recipients = [
        {
          notificationId: '550e8400-e29b-41d4-a716-446655440000',
          recipientType: 'customer',
          email: 'test@example.com',
        },
        {
          notificationId: '550e8400-e29b-41d4-a716-446655440000',
          recipientType: 'customer',
          email: 'test2@example.com',
        },
      ];

      const entities = [mockRecipient, { ...mockRecipient, id: '2' }];
      mockTypeOrmRepo.create.mockReturnValue(entities);
      mockTypeOrmRepo.save.mockResolvedValue(entities);

      const result = await repository.createBatch(recipients);

      expect(result).toEqual(entities);
      expect(mockTypeOrmRepo.create).toHaveBeenCalledWith(recipients);
      expect(mockTypeOrmRepo.save).toHaveBeenCalledWith(entities);
    });
  });

  describe('findByNotificationId', () => {
    it('should return recipients ordered by createdAt ASC', async () => {
      mockTypeOrmRepo.find.mockResolvedValue([mockRecipient]);

      const result = await repository.findByNotificationId(
        mockRecipient.notificationId,
      );

      expect(result).toEqual([mockRecipient]);
      expect(mockTypeOrmRepo.find).toHaveBeenCalledWith({
        where: { notificationId: mockRecipient.notificationId },
        order: { createdAt: 'ASC' },
      });
    });

    it('should return empty array when no recipients found', async () => {
      mockTypeOrmRepo.find.mockResolvedValue([]);

      const result = await repository.findByNotificationId('nonexistent');

      expect(result).toEqual([]);
    });
  });
});
