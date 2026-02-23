import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { EventMappingsService } from './event-mappings.service.js';
import { EventMappingsRepository } from './event-mappings.repository.js';
import { EventMapping } from './entities/event-mapping.entity.js';
import { MappingEngineService } from '../normalization/mapping-engine.service.js';
import { EventTypeResolverService } from '../normalization/event-type-resolver.service.js';
import { PayloadValidatorService } from '../normalization/payload-validator.service.js';
import { EXCHANGE_CONFIG_EVENTS } from '../rabbitmq/rabbitmq.constants.js';

describe('EventMappingsService', () => {
  let service: EventMappingsService;
  let repository: jest.Mocked<EventMappingsRepository>;
  let mappingEngine: jest.Mocked<MappingEngineService>;
  let eventTypeResolver: jest.Mocked<EventTypeResolverService>;
  let payloadValidator: jest.Mocked<PayloadValidatorService>;
  let amqpConnection: jest.Mocked<AmqpConnection>;

  const mockMapping: EventMapping = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    sourceId: 'shopify',
    eventType: 'order.created',
    name: 'Shopify Order Created',
    description: null,
    fieldMappings: {
      orderId: { source: 'id', target: 'orderId' },
    },
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
    const mockRepository = {
      findById: jest.fn(),
      findWithPagination: jest.fn(),
      findBySourceAndType: jest.fn(),
      existsActiveMapping: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventMappingsService,
        { provide: EventMappingsRepository, useValue: mockRepository },
        {
          provide: MappingEngineService,
          useValue: { normalizePayload: jest.fn() },
        },
        {
          provide: EventTypeResolverService,
          useValue: { resolve: jest.fn() },
        },
        {
          provide: PayloadValidatorService,
          useValue: { validate: jest.fn() },
        },
        {
          provide: AmqpConnection,
          useValue: { publish: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<EventMappingsService>(EventMappingsService);
    repository = module.get(EventMappingsRepository);
    mappingEngine = module.get(MappingEngineService);
    eventTypeResolver = module.get(EventTypeResolverService);
    payloadValidator = module.get(PayloadValidatorService);
    amqpConnection = module.get(AmqpConnection);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated results', async () => {
      const result = { data: [mockMapping], total: 1, page: 1, limit: 50 };
      repository.findWithPagination.mockResolvedValue(result);

      const response = await service.findAll({ page: 1, limit: 50 });

      expect(response).toEqual(result);
      expect(repository.findWithPagination).toHaveBeenCalledWith({
        where: {},
        page: 1,
        limit: 50,
        order: { createdAt: 'DESC' },
      });
    });

    it('should apply filters when provided', async () => {
      const result = { data: [], total: 0, page: 1, limit: 50 };
      repository.findWithPagination.mockResolvedValue(result);

      await service.findAll({
        sourceId: 'shopify',
        eventType: 'order.created',
        isActive: true,
        page: 1,
        limit: 50,
      });

      expect(repository.findWithPagination).toHaveBeenCalledWith({
        where: {
          sourceId: 'shopify',
          eventType: 'order.created',
          isActive: true,
        },
        page: 1,
        limit: 50,
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('findById', () => {
    it('should return the mapping when found', async () => {
      repository.findById.mockResolvedValue(mockMapping);

      const result = await service.findById(mockMapping.id);
      expect(result).toEqual(mockMapping);
    });

    it('should throw EIS-002 when not found', async () => {
      repository.findById.mockResolvedValue(null);

      try {
        await service.findById('nonexistent-id');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse() as any;
        expect(response.code).toBe('EIS-002');
      }
    });
  });

  describe('create', () => {
    it('should create a new mapping when no conflict exists', async () => {
      repository.existsActiveMapping.mockResolvedValue(false);
      repository.create.mockResolvedValue(mockMapping);

      const dto = {
        sourceId: 'shopify',
        eventType: 'order.created',
        name: 'Shopify Order Created',
        fieldMappings: { orderId: '$.id' },
      };

      const result = await service.create(dto);
      expect(result).toEqual(mockMapping);
      expect(repository.existsActiveMapping).toHaveBeenCalledWith(
        'shopify',
        'order.created',
      );
    });

    it('should throw EIS-009 when active mapping conflict exists', async () => {
      repository.existsActiveMapping.mockResolvedValue(true);

      const dto = {
        sourceId: 'shopify',
        eventType: 'order.created',
        name: 'Shopify Order Created',
        fieldMappings: { orderId: '$.id' },
      };

      try {
        await service.create(dto);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse() as any;
        expect(response.code).toBe('EIS-009');
      }
    });

    it('should publish config.mapping.changed after create', async () => {
      repository.existsActiveMapping.mockResolvedValue(false);
      repository.create.mockResolvedValue(mockMapping);

      await service.create({
        sourceId: 'shopify',
        eventType: 'order.created',
        name: 'Shopify Order Created',
        fieldMappings: { orderId: '$.id' },
      });

      expect(amqpConnection.publish).toHaveBeenCalledWith(
        EXCHANGE_CONFIG_EVENTS,
        'config.mapping.changed',
        { id: mockMapping.id, version: mockMapping.version },
        expect.objectContaining({ persistent: true }),
      );
    });
  });

  describe('update', () => {
    it('should update the mapping and increment version', async () => {
      repository.findById.mockResolvedValue({ ...mockMapping });
      repository.save.mockImplementation(async (entity) => entity);

      const result = await service.update(mockMapping.id, { name: 'Updated' });

      expect(result.name).toBe('Updated');
      expect(result.version).toBe(2);
      expect(repository.save).toHaveBeenCalled();
    });

    it('should throw EIS-002 when mapping not found', async () => {
      repository.findById.mockResolvedValue(null);

      try {
        await service.update('nonexistent-id', { name: 'Updated' });
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse() as any;
        expect(response.code).toBe('EIS-002');
      }
    });

    it('should publish config.mapping.changed after update', async () => {
      const updatedMapping = { ...mockMapping, version: 2 };
      repository.findById.mockResolvedValue({ ...mockMapping });
      repository.save.mockResolvedValue(updatedMapping);

      await service.update(mockMapping.id, { name: 'Updated' });

      expect(amqpConnection.publish).toHaveBeenCalledWith(
        EXCHANGE_CONFIG_EVENTS,
        'config.mapping.changed',
        { id: updatedMapping.id, version: updatedMapping.version },
        expect.objectContaining({ persistent: true }),
      );
    });
  });

  describe('softDelete', () => {
    it('should set isActive to false', async () => {
      repository.findById.mockResolvedValue({ ...mockMapping });
      repository.save.mockImplementation(async (entity) => entity);

      const result = await service.softDelete(mockMapping.id);

      expect(result.isActive).toBe(false);
      expect(repository.save).toHaveBeenCalled();
    });

    it('should throw EIS-002 when mapping not found', async () => {
      repository.findById.mockResolvedValue(null);

      try {
        await service.softDelete('nonexistent-id');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse() as any;
        expect(response.code).toBe('EIS-002');
      }
    });

    it('should publish config.mapping.changed after soft delete', async () => {
      const deletedMapping = { ...mockMapping, isActive: false };
      repository.findById.mockResolvedValue({ ...mockMapping });
      repository.save.mockResolvedValue(deletedMapping);

      await service.softDelete(mockMapping.id);

      expect(amqpConnection.publish).toHaveBeenCalledWith(
        EXCHANGE_CONFIG_EVENTS,
        'config.mapping.changed',
        { id: deletedMapping.id, version: deletedMapping.version },
        expect.objectContaining({ persistent: true }),
      );
    });
  });

  describe('testMapping', () => {
    it('should return canonical event for valid payload', async () => {
      repository.findById.mockResolvedValue(mockMapping);
      eventTypeResolver.resolve.mockReturnValue('order.created');
      mappingEngine.normalizePayload.mockReturnValue({
        normalizedFields: { orderId: 'ORD-123' },
        warnings: [],
        missingRequiredFields: [],
      });

      const result = await service.testMapping(mockMapping.id, {
        samplePayload: { id: 'ORD-123' },
      });

      expect(result.canonicalEvent).toBeDefined();
      expect(result.canonicalEvent.orderId).toBe('ORD-123');
      expect(result.canonicalEvent.metadata).toBeDefined();
      expect(result.canonicalEvent.metadata.schemaVersion).toBe('2.0');
      expect(result.warnings).toHaveLength(0);
    });

    it('should throw EIS-002 when mapping not found', async () => {
      repository.findById.mockResolvedValue(null);

      try {
        await service.testMapping('nonexistent', {
          samplePayload: {},
        });
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse() as any;
        expect(response.code).toBe('EIS-002');
      }
    });

    it('should include validation errors as warnings', async () => {
      const mappingWithSchema = {
        ...mockMapping,
        validationSchema: { type: 'object', required: ['orderId'] },
      };
      repository.findById.mockResolvedValue(mappingWithSchema);
      payloadValidator.validate.mockReturnValue({
        valid: false,
        errors: ['/ must have required property "orderId"'],
      });
      eventTypeResolver.resolve.mockReturnValue('order.created');
      mappingEngine.normalizePayload.mockReturnValue({
        normalizedFields: {},
        warnings: [],
        missingRequiredFields: [],
      });

      const result = await service.testMapping(mockMapping.id, {
        samplePayload: {},
      });

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Validation');
    });

    it('should report missing required fields', async () => {
      repository.findById.mockResolvedValue(mockMapping);
      eventTypeResolver.resolve.mockReturnValue('order.created');
      mappingEngine.normalizePayload.mockReturnValue({
        normalizedFields: {},
        warnings: [],
        missingRequiredFields: ['orderId'],
      });

      const result = await service.testMapping(mockMapping.id, {
        samplePayload: {},
      });

      expect(result.missingRequiredFields).toContain('orderId');
    });
  });

  describe('publish failure handling', () => {
    it('should not throw when publish fails after create', async () => {
      repository.existsActiveMapping.mockResolvedValue(false);
      repository.create.mockResolvedValue(mockMapping);
      amqpConnection.publish.mockRejectedValue(new Error('RabbitMQ down'));

      const result = await service.create({
        sourceId: 'shopify',
        eventType: 'order.created',
        name: 'Shopify Order Created',
        fieldMappings: { orderId: '$.id' },
      });

      expect(result).toEqual(mockMapping);
    });
  });
});
