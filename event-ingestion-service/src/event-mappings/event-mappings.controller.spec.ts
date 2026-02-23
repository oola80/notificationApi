import { Test, TestingModule } from '@nestjs/testing';
import { EventMappingsController } from './event-mappings.controller.js';
import { EventMappingsService } from './event-mappings.service.js';
import { EventMapping } from './entities/event-mapping.entity.js';

describe('EventMappingsController', () => {
  let controller: EventMappingsController;
  let service: jest.Mocked<EventMappingsService>;

  const mockMapping: EventMapping = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    sourceId: 'shopify',
    eventType: 'order.created',
    name: 'Shopify Order Created',
    description: null,
    fieldMappings: { orderId: '$.id' },
    eventTypeMapping: null,
    timestampField: null,
    timestampFormat: 'iso8601',
    sourceEventIdField: null,
    validationSchema: null,
    priority: 'normal',
    isActive: true,
    version: 1,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockService = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      testMapping: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventMappingsController],
      providers: [{ provide: EventMappingsService, useValue: mockService }],
    }).compile();

    controller = module.get<EventMappingsController>(EventMappingsController);
    service = module.get(EventMappingsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should delegate to service.findAll with query params', async () => {
      const result = {
        data: [mockMapping],
        total: 1,
        page: 1,
        limit: 50,
      };
      service.findAll.mockResolvedValue(result);

      const query = { page: 1, limit: 50 };
      expect(await controller.findAll(query)).toEqual(result);
      expect(service.findAll).toHaveBeenCalledWith(query);
    });
  });

  describe('findById', () => {
    it('should delegate to service.findById', async () => {
      service.findById.mockResolvedValue(mockMapping);

      expect(await controller.findById(mockMapping.id)).toEqual(mockMapping);
      expect(service.findById).toHaveBeenCalledWith(mockMapping.id);
    });
  });

  describe('create', () => {
    it('should delegate to service.create', async () => {
      service.create.mockResolvedValue(mockMapping);

      const dto = {
        sourceId: 'shopify',
        eventType: 'order.created',
        name: 'Shopify Order Created',
        fieldMappings: { orderId: '$.id' },
      };
      expect(await controller.create(dto)).toEqual(mockMapping);
      expect(service.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('update', () => {
    it('should delegate to service.update', async () => {
      const updated = { ...mockMapping, name: 'Updated', version: 2 };
      service.update.mockResolvedValue(updated);

      const dto = { name: 'Updated' };
      expect(await controller.update(mockMapping.id, dto)).toEqual(updated);
      expect(service.update).toHaveBeenCalledWith(mockMapping.id, dto);
    });
  });

  describe('remove', () => {
    it('should delegate to service.softDelete', async () => {
      const deactivated = { ...mockMapping, isActive: false };
      service.softDelete.mockResolvedValue(deactivated);

      await controller.remove(mockMapping.id);
      expect(service.softDelete).toHaveBeenCalledWith(mockMapping.id);
    });
  });

  describe('testMapping', () => {
    it('should delegate to service.testMapping', async () => {
      const result = {
        canonicalEvent: { orderId: 'ORD-123', metadata: {} },
        warnings: [],
        missingRequiredFields: [],
      };
      service.testMapping.mockResolvedValue(result);

      const dto = { samplePayload: { id: 'ORD-123' } };
      expect(await controller.testMapping(mockMapping.id, dto)).toEqual(result);
      expect(service.testMapping).toHaveBeenCalledWith(mockMapping.id, dto);
    });
  });
});
