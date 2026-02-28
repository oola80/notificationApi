import { AuditEventsRepository } from './audit-events.repository';
import { AuditEvent } from './entities/audit-event.entity';

describe('AuditEventsRepository', () => {
  let repository: AuditEventsRepository;
  let mockTypeOrmRepo: any;

  beforeEach(() => {
    mockTypeOrmRepo = {
      findOne: jest.fn(),
      findAndCount: jest.fn(),
    };
    repository = new AuditEventsRepository(mockTypeOrmRepo);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('findById', () => {
    it('should find an audit event by id', async () => {
      const event = new AuditEvent();
      event.id = 'test-uuid';
      event.eventType = 'DELIVERY_SENT';
      event.actor = 'channel-router-service';
      mockTypeOrmRepo.findOne.mockResolvedValue(event);

      const result = await repository.findById('test-uuid');
      expect(result).toBe(event);
      expect(mockTypeOrmRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'test-uuid' },
      });
    });

    it('should return null when not found', async () => {
      mockTypeOrmRepo.findOne.mockResolvedValue(null);
      const result = await repository.findById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('findWithPagination', () => {
    it('should return paginated results', async () => {
      const events = [new AuditEvent(), new AuditEvent()];
      mockTypeOrmRepo.findAndCount.mockResolvedValue([events, 2]);

      const result = await repository.findWithPagination({
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });

    it('should use default pagination values', async () => {
      mockTypeOrmRepo.findAndCount.mockResolvedValue([[], 0]);

      const result = await repository.findWithPagination({});

      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
      expect(mockTypeOrmRepo.findAndCount).toHaveBeenCalledWith({
        where: undefined,
        order: undefined,
        skip: 0,
        take: 50,
      });
    });
  });
});
