import { Test, TestingModule } from '@nestjs/testing';
import { RecipientGroupsController } from './recipient-groups.controller.js';
import { RecipientGroupsService } from './recipient-groups.service.js';

const mockGroup = {
  id: 'aaa-bbb-ccc',
  name: 'Test Group',
  description: 'A test group',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  members: [],
};

describe('RecipientGroupsController', () => {
  let controller: RecipientGroupsController;
  let service: RecipientGroupsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RecipientGroupsController],
      providers: [
        {
          provide: RecipientGroupsService,
          useValue: {
            create: jest.fn().mockResolvedValue(mockGroup),
            findAll: jest.fn().mockResolvedValue({
              data: [mockGroup],
              total: 1,
              page: 1,
              limit: 50,
            }),
            update: jest.fn().mockResolvedValue(mockGroup),
          },
        },
      ],
    }).compile();

    controller = module.get<RecipientGroupsController>(
      RecipientGroupsController,
    );
    service = module.get<RecipientGroupsService>(RecipientGroupsService);
  });

  describe('create', () => {
    it('should delegate to service.create', async () => {
      const dto = { name: 'Test Group' };
      const result = await controller.create(dto as any);
      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockGroup);
    });
  });

  describe('findAll', () => {
    it('should delegate to service.findAll', async () => {
      const query = { page: 1, limit: 50 };
      const result = await controller.findAll(query as any);
      expect(service.findAll).toHaveBeenCalledWith(query);
      expect(result.data).toHaveLength(1);
    });

    it('should pass isActive filter', async () => {
      const query = { isActive: true, page: 1, limit: 50 };
      await controller.findAll(query as any);
      expect(service.findAll).toHaveBeenCalledWith(query);
    });
  });

  describe('update', () => {
    it('should delegate to service.update with id and dto', async () => {
      const dto = { name: 'Updated Group' };
      const result = await controller.update('aaa-bbb-ccc', dto as any);
      expect(service.update).toHaveBeenCalledWith('aaa-bbb-ccc', dto);
      expect(result).toEqual(mockGroup);
    });
  });
});
