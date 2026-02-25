import { Test, TestingModule } from '@nestjs/testing';
import { RecipientGroupsService } from './recipient-groups.service.js';
import { RecipientGroupsRepository } from './recipient-groups.repository.js';
import { HttpException } from '@nestjs/common';

const mockGroup = {
  id: 'aaa-bbb-ccc',
  name: 'Test Group',
  description: 'A test group',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  members: [],
};

describe('RecipientGroupsService', () => {
  let service: RecipientGroupsService;
  let repository: RecipientGroupsRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecipientGroupsService,
        {
          provide: RecipientGroupsRepository,
          useValue: {
            existsByName: jest.fn().mockResolvedValue(false),
            create: jest.fn().mockResolvedValue(mockGroup),
            findWithMembers: jest.fn().mockResolvedValue(mockGroup),
            findAllPaginated: jest.fn().mockResolvedValue({
              data: [mockGroup],
              total: 1,
              page: 1,
              limit: 50,
            }),
            save: jest.fn().mockResolvedValue(mockGroup),
            addMembers: jest.fn().mockResolvedValue([]),
            deactivateMembers: jest.fn().mockResolvedValue(undefined),
            findById: jest.fn().mockResolvedValue(mockGroup),
          },
        },
      ],
    }).compile();

    service = module.get<RecipientGroupsService>(RecipientGroupsService);
    repository = module.get<RecipientGroupsRepository>(
      RecipientGroupsRepository,
    );
  });

  describe('create', () => {
    it('should create a group successfully', async () => {
      const dto = { name: 'Test Group', description: 'A test group' };
      const result = await service.create(dto);
      expect(repository.existsByName).toHaveBeenCalledWith('Test Group');
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Group',
          description: 'A test group',
        }),
      );
      expect(result).toEqual(mockGroup);
    });

    it('should throw NES-014 on duplicate name', async () => {
      jest.spyOn(repository, 'existsByName').mockResolvedValue(true);
      try {
        await service.create({ name: 'Duplicate' });
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect((e as HttpException).getResponse()).toEqual(
          expect.objectContaining({ code: 'NES-014' }),
        );
      }
    });

    it('should create group with members', async () => {
      const dto = {
        name: 'With Members',
        members: [{ email: 'a@b.com', phone: '+1234' }],
      };
      await service.create(dto);
      expect(repository.addMembers).toHaveBeenCalledWith(
        mockGroup.id,
        expect.arrayContaining([
          expect.objectContaining({ email: 'a@b.com', phone: '+1234' }),
        ]),
      );
    });

    it('should not call addMembers when no members provided', async () => {
      await service.create({ name: 'No Members' });
      expect(repository.addMembers).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return paginated results', async () => {
      const result = await service.findAll({ page: 1, limit: 50 });
      expect(repository.findAllPaginated).toHaveBeenCalledWith({
        isActive: undefined,
        page: 1,
        limit: 50,
      });
      expect(result.data).toHaveLength(1);
    });

    it('should pass isActive filter', async () => {
      await service.findAll({ isActive: true, page: 1, limit: 50 });
      expect(repository.findAllPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true }),
      );
    });
  });

  describe('findById', () => {
    it('should return group with members', async () => {
      const result = await service.findById('aaa-bbb-ccc');
      expect(repository.findWithMembers).toHaveBeenCalledWith('aaa-bbb-ccc');
      expect(result).toEqual(mockGroup);
    });

    it('should throw NES-004 when not found', async () => {
      jest.spyOn(repository, 'findWithMembers').mockResolvedValue(null);
      try {
        await service.findById('not-found');
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect((e as HttpException).getResponse()).toEqual(
          expect.objectContaining({ code: 'NES-004' }),
        );
      }
    });
  });

  describe('update', () => {
    it('should update name and description', async () => {
      const dto = { name: 'Updated', description: 'Updated desc' };
      await service.update('aaa-bbb-ccc', dto);
      expect(repository.existsByName).toHaveBeenCalledWith(
        'Updated',
        'aaa-bbb-ccc',
      );
      expect(repository.save).toHaveBeenCalled();
    });

    it('should throw NES-014 on duplicate name during update', async () => {
      jest.spyOn(repository, 'existsByName').mockResolvedValue(true);
      try {
        await service.update('aaa-bbb-ccc', { name: 'Duplicate' });
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect((e as HttpException).getResponse()).toEqual(
          expect.objectContaining({ code: 'NES-014' }),
        );
      }
    });

    it('should add new members', async () => {
      const dto = { addMembers: [{ email: 'new@test.com' }] };
      await service.update('aaa-bbb-ccc', dto);
      expect(repository.addMembers).toHaveBeenCalledWith(
        'aaa-bbb-ccc',
        expect.arrayContaining([
          expect.objectContaining({ email: 'new@test.com' }),
        ]),
      );
    });

    it('should deactivate members by IDs', async () => {
      const dto = { removeMemberIds: [1, 2, 3] };
      await service.update('aaa-bbb-ccc', dto);
      expect(repository.deactivateMembers).toHaveBeenCalledWith([1, 2, 3]);
    });

    it('should not call addMembers/deactivateMembers when not provided', async () => {
      await service.update('aaa-bbb-ccc', { description: 'Only desc' });
      expect(repository.addMembers).not.toHaveBeenCalled();
      expect(repository.deactivateMembers).not.toHaveBeenCalled();
    });
  });
});
