import { TemplatesController } from './templates.controller.js';
import { TemplatesService } from './services/templates.service.js';

describe('TemplatesController', () => {
  let controller: TemplatesController;
  let service: jest.Mocked<TemplatesService>;

  const mockTemplate = {
    id: '11111111-1111-1111-1111-111111111111',
    slug: 'order-confirmation',
    name: 'Order Confirmation',
    description: 'Confirms an order',
    currentVersionId: '22222222-2222-2222-2222-222222222222',
    isActive: true,
    createdBy: 'admin',
    updatedBy: 'admin',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    versions: [],
    variables: [],
  };

  const mockPaginatedResult = {
    data: [mockTemplate],
    total: 1,
    page: 1,
    limit: 50,
  };

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      rollback: jest.fn(),
    } as any;

    controller = new TemplatesController(service);
  });

  describe('POST /templates', () => {
    it('should call service.create and return the created template', async () => {
      service.create.mockResolvedValue(mockTemplate as any);

      const dto = {
        slug: 'order-confirmation',
        name: 'Order Confirmation',
        channels: [{ channel: 'email', subject: 'Order', body: 'Hello' }],
        createdBy: 'admin',
      };

      const result = await controller.create(dto);

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockTemplate);
    });
  });

  describe('GET /templates', () => {
    it('should call service.findAll with query params', async () => {
      service.findAll.mockResolvedValue(mockPaginatedResult as any);

      const query = { page: 1, limit: 10, search: 'order' };
      const result = await controller.findAll(query);

      expect(service.findAll).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockPaginatedResult);
    });

    it('should call service.findAll with empty query', async () => {
      service.findAll.mockResolvedValue(mockPaginatedResult as any);

      const result = await controller.findAll({});

      expect(service.findAll).toHaveBeenCalledWith({});
      expect(result).toEqual(mockPaginatedResult);
    });
  });

  describe('GET /templates/:id', () => {
    it('should call service.findById and return the template', async () => {
      service.findById.mockResolvedValue(mockTemplate as any);

      const result = await controller.findById(mockTemplate.id);

      expect(service.findById).toHaveBeenCalledWith(mockTemplate.id);
      expect(result).toEqual(mockTemplate);
    });
  });

  describe('PUT /templates/:id', () => {
    it('should call service.update and return the updated template', async () => {
      const updated = { ...mockTemplate, updatedBy: 'editor' };
      service.update.mockResolvedValue(updated as any);

      const dto = {
        channels: [{ channel: 'email', subject: 'Updated', body: 'New body' }],
        changeSummary: 'Updated content',
        updatedBy: 'editor',
      };

      const result = await controller.update(mockTemplate.id, dto);

      expect(service.update).toHaveBeenCalledWith(mockTemplate.id, dto);
      expect(result).toEqual(updated);
    });
  });

  describe('DELETE /templates/:id', () => {
    it('should call service.delete and return the soft-deleted template', async () => {
      const deleted = { ...mockTemplate, isActive: false };
      service.delete.mockResolvedValue(deleted as any);

      const result = await controller.delete(mockTemplate.id);

      expect(service.delete).toHaveBeenCalledWith(mockTemplate.id);
      expect(result.isActive).toBe(false);
    });
  });

  describe('POST /templates/:id/rollback', () => {
    it('should call service.rollback and return the rolledback template', async () => {
      service.rollback.mockResolvedValue(mockTemplate as any);

      const dto = { versionNumber: 1 };
      const result = await controller.rollback(mockTemplate.id, dto);

      expect(service.rollback).toHaveBeenCalledWith(mockTemplate.id, dto);
      expect(result).toEqual(mockTemplate);
    });
  });
});
