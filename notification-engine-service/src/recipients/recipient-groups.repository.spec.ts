import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RecipientGroupsRepository } from './recipient-groups.repository.js';
import { RecipientGroup } from './entities/recipient-group.entity.js';
import { RecipientGroupMember } from './entities/recipient-group-member.entity.js';

const mockGroup = {
  id: 'aaa-bbb-ccc',
  name: 'Test Group',
  description: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  members: [
    { id: 1, groupId: 'aaa-bbb-ccc', email: 'a@b.com', isActive: true },
    { id: 2, groupId: 'aaa-bbb-ccc', email: 'c@d.com', isActive: false },
  ],
};

const mockQueryBuilder = {
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  getCount: jest.fn().mockResolvedValue(0),
};

describe('RecipientGroupsRepository', () => {
  let repository: RecipientGroupsRepository;
  let mockGroupRepo: any;
  let mockMemberRepo: any;

  beforeEach(async () => {
    mockGroupRepo = {
      findOne: jest.fn().mockResolvedValue({ ...mockGroup }),
      findAndCount: jest.fn().mockResolvedValue([[mockGroup], 1]),
      create: jest.fn().mockReturnValue(mockGroup),
      save: jest.fn().mockResolvedValue(mockGroup),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    mockMemberRepo = {
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockImplementation((data) => Promise.resolve(data)),
      find: jest.fn().mockResolvedValue([mockGroup.members[0]]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecipientGroupsRepository,
        {
          provide: getRepositoryToken(RecipientGroup),
          useValue: mockGroupRepo,
        },
        {
          provide: getRepositoryToken(RecipientGroupMember),
          useValue: mockMemberRepo,
        },
      ],
    }).compile();

    repository = module.get<RecipientGroupsRepository>(
      RecipientGroupsRepository,
    );
  });

  describe('findWithMembers', () => {
    it('should find group and filter active members', async () => {
      const result = await repository.findWithMembers('aaa-bbb-ccc');
      expect(mockGroupRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'aaa-bbb-ccc' },
        relations: ['members'],
      });
      expect(result!.members).toHaveLength(1);
      expect(result!.members[0].isActive).toBe(true);
    });

    it('should return null when group not found', async () => {
      mockGroupRepo.findOne.mockResolvedValue(null);
      const result = await repository.findWithMembers('not-found');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create and save entity', async () => {
      const data = { name: 'New Group', description: null };
      await repository.create(data);
      expect(mockGroupRepo.create).toHaveBeenCalledWith(data);
      expect(mockGroupRepo.save).toHaveBeenCalled();
    });
  });

  describe('addMembers', () => {
    it('should bulk create member entities', async () => {
      const members = [
        { email: 'x@y.com', phone: null, deviceToken: null, memberName: null },
      ];
      await repository.addMembers('aaa-bbb-ccc', members as any);
      expect(mockMemberRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ groupId: 'aaa-bbb-ccc', email: 'x@y.com' }),
      );
      expect(mockMemberRepo.save).toHaveBeenCalled();
    });
  });

  describe('deactivateMembers', () => {
    it('should update isActive to false for given IDs', async () => {
      await repository.deactivateMembers([1, 2]);
      expect(mockMemberRepo.update).toHaveBeenCalled();
    });

    it('should skip when empty array', async () => {
      await repository.deactivateMembers([]);
      expect(mockMemberRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('findActiveMembers', () => {
    it('should find active members by groupId', async () => {
      const result = await repository.findActiveMembers('aaa-bbb-ccc');
      expect(mockMemberRepo.find).toHaveBeenCalledWith({
        where: { groupId: 'aaa-bbb-ccc', isActive: true },
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('existsByName', () => {
    it('should check name exists', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(1);
      const result = await repository.existsByName('Test Group');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'group.name = :name',
        { name: 'Test Group' },
      );
      expect(result).toBe(true);
    });

    it('should exclude specific id', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);
      const result = await repository.existsByName('Test', 'exclude-id');
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'group.id != :excludeId',
        { excludeId: 'exclude-id' },
      );
      expect(result).toBe(false);
    });
  });
});
