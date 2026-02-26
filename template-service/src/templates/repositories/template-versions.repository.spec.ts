import { TemplateVersionsRepository } from './template-versions.repository.js';
import { TemplateVersion } from '../entities/template-version.entity.js';

describe('TemplateVersionsRepository', () => {
  let repository: TemplateVersionsRepository;
  let mockTypeOrmRepo: any;
  let mockQueryBuilder: any;

  beforeEach(() => {
    mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(),
    };

    mockTypeOrmRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      find: jest.fn(),
      create: jest.fn((data: any) => ({ ...data })),
      save: jest.fn((entity: any) =>
        Promise.resolve({ id: 'version-id', ...entity }),
      ),
    };

    repository = new TemplateVersionsRepository(mockTypeOrmRepo);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('getNextVersionNumber', () => {
    it('should return MAX+1 when versions exist', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue({ maxVersion: 3 });

      const result = await repository.getNextVersionNumber('template-id');

      expect(result).toBe(4);
      expect(mockTypeOrmRepo.createQueryBuilder).toHaveBeenCalledWith('v');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'v.template_id = :templateId',
        { templateId: 'template-id' },
      );
      expect(mockQueryBuilder.select).toHaveBeenCalledWith(
        'COALESCE(MAX(v.version_number), 0)',
        'maxVersion',
      );
    });

    it('should return 1 when no versions exist', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue({ maxVersion: 0 });

      const result = await repository.getNextVersionNumber('template-id');

      expect(result).toBe(1);
    });

    it('should return 1 when getRawOne returns null', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue(null);

      const result = await repository.getNextVersionNumber('template-id');

      expect(result).toBe(1);
    });
  });

  describe('findByTemplateId', () => {
    it('should return versions with channels ordered DESC', async () => {
      const mockVersions: Partial<TemplateVersion>[] = [
        {
          id: 'v2',
          templateId: 'tid',
          versionNumber: 2,
          channels: [],
          createdAt: new Date(),
        } as any,
        {
          id: 'v1',
          templateId: 'tid',
          versionNumber: 1,
          channels: [],
          createdAt: new Date(),
        } as any,
      ];
      mockTypeOrmRepo.find.mockResolvedValue(mockVersions);

      const result = await repository.findByTemplateId('tid');

      expect(result).toEqual(mockVersions);
      expect(mockTypeOrmRepo.find).toHaveBeenCalledWith({
        where: { templateId: 'tid' },
        relations: ['channels'],
        order: { versionNumber: 'DESC' },
      });
    });

    it('should return empty array when none found', async () => {
      mockTypeOrmRepo.find.mockResolvedValue([]);

      const result = await repository.findByTemplateId('nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('create', () => {
    it('should create and save entity', async () => {
      const data: Partial<TemplateVersion> = {
        templateId: 'tid',
        versionNumber: 1,
        changeSummary: 'Initial version',
        createdBy: 'admin',
      };

      const result = await repository.create(data);

      expect(mockTypeOrmRepo.create).toHaveBeenCalledWith(data);
      expect(mockTypeOrmRepo.save).toHaveBeenCalled();
      expect(result.templateId).toBe('tid');
      expect(result.versionNumber).toBe(1);
    });
  });
});
