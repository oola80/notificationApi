import { TemplatesRepository } from './templates.repository.js';

describe('TemplatesRepository', () => {
  let repository: TemplatesRepository;
  let mockTypeOrmRepo: any;
  let mockQueryBuilder: any;

  beforeEach(() => {
    mockQueryBuilder = {
      andWhere: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      getCount: jest.fn().mockResolvedValue(0),
    };

    mockTypeOrmRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      create: jest.fn((data: any) => ({ ...data })),
      save: jest.fn((entity: any) => Promise.resolve({ id: 'new-id', ...entity })),
    };

    repository = new TemplatesRepository(mockTypeOrmRepo);
  });

  describe('findAllPaginated', () => {
    it('should apply search filter on slug and name', async () => {
      await repository.findAllPaginated({ search: 'order' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(t.slug ILIKE :search OR t.name ILIKE :search)',
        { search: '%order%' },
      );
    });

    it('should apply isActive filter', async () => {
      await repository.findAllPaginated({ isActive: true });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        't.is_active = :isActive',
        { isActive: true },
      );
    });

    it('should use default sort (createdAt DESC)', async () => {
      await repository.findAllPaginated({});

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        't.created_at',
        'DESC',
      );
    });

    it('should support custom sort', async () => {
      await repository.findAllPaginated({
        sortBy: 'name',
        sortOrder: 'ASC',
      });

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('t.name', 'ASC');
    });

    it('should use default pagination (page 1, limit 50)', async () => {
      await repository.findAllPaginated({});

      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(50);
    });

    it('should calculate correct offset for page 3, limit 10', async () => {
      await repository.findAllPaginated({ page: 3, limit: 10 });

      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(20);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
    });

    it('should return paginated result structure', async () => {
      const mockData = [{ id: '1', slug: 'test' }];
      mockQueryBuilder.getManyAndCount.mockResolvedValue([mockData, 1]);

      const result = await repository.findAllPaginated({ page: 1, limit: 10 });

      expect(result).toEqual({
        data: mockData,
        total: 1,
        page: 1,
        limit: 10,
      });
    });

    it('should not apply search filter when search is undefined', async () => {
      await repository.findAllPaginated({});

      expect(mockQueryBuilder.andWhere).not.toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        expect.anything(),
      );
    });

    it('should not apply isActive filter when undefined', async () => {
      await repository.findAllPaginated({});

      expect(mockQueryBuilder.andWhere).not.toHaveBeenCalledWith(
        expect.stringContaining('is_active'),
        expect.anything(),
      );
    });

    it('should apply channel filter with EXISTS subquery', async () => {
      await repository.findAllPaginated({ channel: 'email' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('EXISTS'),
        { channel: 'email' },
      );
    });

    it('should not apply channel filter when channel is undefined', async () => {
      await repository.findAllPaginated({});

      expect(mockQueryBuilder.andWhere).not.toHaveBeenCalledWith(
        expect.stringContaining('EXISTS'),
        expect.anything(),
      );
    });
  });

  describe('findByIdWithRelations', () => {
    it('should query with all relations', async () => {
      mockTypeOrmRepo.findOne.mockResolvedValue({ id: '1' });

      await repository.findByIdWithRelations('test-id');

      expect(mockTypeOrmRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'test-id' },
        relations: ['versions', 'versions.channels', 'variables'],
      });
    });

    it('should return null when not found', async () => {
      mockTypeOrmRepo.findOne.mockResolvedValue(null);

      const result = await repository.findByIdWithRelations('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findBySlug', () => {
    it('should query by slug', async () => {
      mockTypeOrmRepo.findOne.mockResolvedValue({ id: '1', slug: 'test' });

      await repository.findBySlug('test');

      expect(mockTypeOrmRepo.findOne).toHaveBeenCalledWith({
        where: { slug: 'test' },
      });
    });
  });

  describe('existsBySlug', () => {
    it('should return true when slug exists', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(1);

      const result = await repository.existsBySlug('existing-slug');

      expect(result).toBe(true);
    });

    it('should return false when slug does not exist', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);

      const result = await repository.existsBySlug('new-slug');

      expect(result).toBe(false);
    });

    it('should exclude specified ID from check', async () => {
      await repository.existsBySlug('test-slug', 'exclude-id');

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        't.id != :excludeId',
        { excludeId: 'exclude-id' },
      );
    });

    it('should not add excludeId clause when not provided', async () => {
      await repository.existsBySlug('test-slug');

      expect(mockQueryBuilder.andWhere).not.toHaveBeenCalledWith(
        expect.stringContaining('excludeId'),
        expect.anything(),
      );
    });
  });

  describe('save', () => {
    it('should delegate to typeorm save', async () => {
      const entity = { id: '1', slug: 'test' } as any;
      mockTypeOrmRepo.save.mockResolvedValue(entity);

      const result = await repository.save(entity);

      expect(mockTypeOrmRepo.save).toHaveBeenCalledWith(entity);
      expect(result).toEqual(entity);
    });
  });

  describe('create', () => {
    it('should create and save entity', async () => {
      const data = { slug: 'new-template', name: 'New Template' };

      const result = await repository.create(data);

      expect(mockTypeOrmRepo.create).toHaveBeenCalledWith(data);
      expect(mockTypeOrmRepo.save).toHaveBeenCalled();
      expect(result.slug).toBe('new-template');
    });
  });
});
