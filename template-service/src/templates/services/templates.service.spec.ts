import { HttpException } from '@nestjs/common';
import { TemplatesService } from './templates.service.js';
import { TemplatesRepository } from '../repositories/templates.repository.js';
import { VariableDetectorService } from './variable-detector.service.js';
import { Template } from '../entities/template.entity.js';
import { TemplateVersion } from '../entities/template-version.entity.js';
import { TemplateChannel } from '../entities/template-channel.entity.js';
import { TemplateVariable } from '../entities/template-variable.entity.js';

describe('TemplatesService', () => {
  let service: TemplatesService;
  let templatesRepository: jest.Mocked<TemplatesRepository>;
  let variableDetector: jest.Mocked<VariableDetectorService>;
  let mockDataSource: any;
  let mockManager: any;
  let mockRepos: Record<string, any>;
  let mockAuditPublisher: any;
  let mockMetricsService: any;

  const mockTemplate: Partial<Template> = {
    id: '11111111-1111-1111-1111-111111111111',
    slug: 'order-confirmation',
    name: 'Order Confirmation',
    description: null,
    currentVersionId: null,
    isActive: true,
    createdBy: 'admin',
    updatedBy: 'admin',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    versions: [],
    variables: [],
  };

  const mockVersion: Partial<TemplateVersion> = {
    id: '22222222-2222-2222-2222-222222222222',
    templateId: mockTemplate.id!,
    versionNumber: 1,
    changeSummary: 'Initial version',
    createdBy: 'admin',
    createdAt: new Date('2026-01-01'),
    channels: [],
  };

  const mockChannel: Partial<TemplateChannel> = {
    id: '33333333-3333-3333-3333-333333333333',
    templateVersionId: mockVersion.id!,
    channel: 'email',
    subject: 'Order {{orderId}}',
    body: 'Hello {{customerName}}',
    metadata: {},
    createdAt: new Date('2026-01-01'),
  };

  beforeEach(() => {
    // Set up mock repositories that the transaction manager returns
    mockRepos = {
      [Template.name]: {
        create: jest.fn((data) => ({ ...data })),
        save: jest.fn((entity) =>
          Promise.resolve({ ...mockTemplate, ...entity }),
        ),
      },
      [TemplateVersion.name]: {
        create: jest.fn((data) => ({ ...data })),
        save: jest.fn((entity) =>
          Promise.resolve({ ...mockVersion, ...entity }),
        ),
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          getRawOne: jest.fn().mockResolvedValue({ maxVersion: 0 }),
        }),
      },
      [TemplateChannel.name]: {
        create: jest.fn((data) => {
          if (Array.isArray(data)) return data.map((d) => ({ ...mockChannel, ...d }));
          return { ...mockChannel, ...data };
        }),
        save: jest.fn((entities) => {
          if (Array.isArray(entities))
            return Promise.resolve(
              entities.map((e) => ({ ...mockChannel, ...e })),
            );
          return Promise.resolve({ ...mockChannel, ...entities });
        }),
      },
      [TemplateVariable.name]: {
        create: jest.fn((data) => {
          if (Array.isArray(data)) return data.map((d) => ({ ...d }));
          return { ...data };
        }),
        save: jest.fn((entities) => {
          if (Array.isArray(entities))
            return Promise.resolve(
              entities.map((e, i) => ({
                id: `var-${i}`,
                ...e,
              })),
            );
          return Promise.resolve({ id: 'var-0', ...entities });
        }),
        find: jest.fn().mockResolvedValue([]),
        remove: jest.fn().mockResolvedValue(undefined),
      },
    };

    mockManager = {
      getRepository: jest.fn((entity) => {
        return mockRepos[entity.name] ?? {};
      }),
    };

    mockDataSource = {
      transaction: jest.fn((cb) => cb(mockManager)),
    };

    templatesRepository = {
      existsBySlug: jest.fn(),
      findById: jest.fn(),
      findByIdWithRelations: jest.fn(),
      findAllPaginated: jest.fn(),
      findBySlug: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      findWithPagination: jest.fn(),
    } as any;

    variableDetector = {
      detectVariables: jest.fn().mockReturnValue(['customerName', 'orderId']),
    } as any;

    mockAuditPublisher = {
      publishTemplateCreated: jest.fn(),
      publishTemplateUpdated: jest.fn(),
      publishTemplateDeleted: jest.fn(),
      publishTemplateRolledback: jest.fn(),
      publishRenderCompleted: jest.fn(),
      publishRenderFailed: jest.fn(),
    };

    mockMetricsService = {
      incrementCrudTotal: jest.fn(),
      incrementVersionCreated: jest.fn(),
    };

    service = new TemplatesService(
      mockDataSource,
      templatesRepository,
      variableDetector,
      undefined,
      mockAuditPublisher,
      mockMetricsService,
    );
  });

  describe('create', () => {
    const createDto = {
      slug: 'order-confirmation',
      name: 'Order Confirmation',
      channels: [
        {
          channel: 'email',
          subject: 'Order {{orderId}}',
          body: 'Hello {{customerName}}',
        },
      ],
      createdBy: 'admin',
    };

    it('should create a template with version, channels, and variables', async () => {
      templatesRepository.existsBySlug.mockResolvedValue(false);

      const result = await service.create(createDto);

      expect(templatesRepository.existsBySlug).toHaveBeenCalledWith(
        'order-confirmation',
      );
      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(result.slug).toBe('order-confirmation');
      expect(result.versions).toHaveLength(1);
      expect(result.variables).toHaveLength(2);
    });

    it('should throw TS-002 on duplicate slug', async () => {
      templatesRepository.existsBySlug.mockResolvedValue(true);

      await expect(service.create(createDto)).rejects.toThrow(HttpException);

      try {
        await service.create(createDto);
      } catch (error) {
        const response = (error as HttpException).getResponse();
        expect((response as any).code).toBe('TS-002');
      }
    });

    it('should throw TS-003 on invalid Handlebars syntax in body', async () => {
      templatesRepository.existsBySlug.mockResolvedValue(false);

      const badDto = {
        ...createDto,
        channels: [{ channel: 'email', subject: 'OK', body: '{{#if}}' }],
      };

      await expect(service.create(badDto)).rejects.toThrow(HttpException);

      try {
        await service.create(badDto);
      } catch (error) {
        const response = (error as HttpException).getResponse();
        expect((response as any).code).toBe('TS-003');
        expect((response as any).message).toContain('email body');
      }
    });

    it('should throw TS-003 on invalid Handlebars syntax in subject', async () => {
      templatesRepository.existsBySlug.mockResolvedValue(false);

      const badDto = {
        ...createDto,
        channels: [
          { channel: 'email', subject: '{{#each}}', body: 'Valid' },
        ],
      };

      await expect(service.create(badDto)).rejects.toThrow(HttpException);

      try {
        await service.create(badDto);
      } catch (error) {
        const response = (error as HttpException).getResponse();
        expect((response as any).code).toBe('TS-003');
        expect((response as any).message).toContain('email subject');
      }
    });

    it('should call variableDetector with channel contents', async () => {
      templatesRepository.existsBySlug.mockResolvedValue(false);

      await service.create(createDto);

      expect(variableDetector.detectVariables).toHaveBeenCalledWith([
        { subject: 'Order {{orderId}}', body: 'Hello {{customerName}}' },
      ]);
    });

    it('should set version 1 with change summary "Initial version"', async () => {
      templatesRepository.existsBySlug.mockResolvedValue(false);

      await service.create(createDto);

      const versionCreate = mockRepos[TemplateVersion.name].create;
      expect(versionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          versionNumber: 1,
          changeSummary: 'Initial version',
        }),
      );
    });

    it('should throw TS-003 on duplicate channels', async () => {
      templatesRepository.existsBySlug.mockResolvedValue(false);

      const badDto = {
        ...createDto,
        channels: [
          { channel: 'email', subject: 'Sub', body: 'Body1' },
          { channel: 'email', subject: 'Sub2', body: 'Body2' },
        ],
      };

      await expect(service.create(badDto)).rejects.toThrow(HttpException);

      try {
        await service.create(badDto);
      } catch (error) {
        const response = (error as HttpException).getResponse();
        expect((response as any).code).toBe('TS-003');
        expect((response as any).message).toContain('Duplicate channel: email');
      }
    });

    it('should handle templates with no variables', async () => {
      templatesRepository.existsBySlug.mockResolvedValue(false);
      variableDetector.detectVariables.mockReturnValue([]);

      const result = await service.create({
        ...createDto,
        channels: [{ channel: 'sms', body: 'Plain text no variables' }],
      });

      expect(result.variables).toEqual([]);
    });
  });

  describe('findAll', () => {
    it('should delegate to repository with query params', async () => {
      const mockResult = { data: [mockTemplate], total: 1, page: 1, limit: 50 };
      templatesRepository.findAllPaginated.mockResolvedValue(mockResult as any);

      const query = { page: 1, limit: 10, search: 'order' };
      const result = await service.findAll(query);

      expect(templatesRepository.findAllPaginated).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockResult);
    });

    it('should pass empty query to repository', async () => {
      const mockResult = { data: [], total: 0, page: 1, limit: 50 };
      templatesRepository.findAllPaginated.mockResolvedValue(mockResult as any);

      const result = await service.findAll({});

      expect(result.data).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should return template with relations', async () => {
      const templateWithRelations = {
        ...mockTemplate,
        versions: [{ ...mockVersion, channels: [mockChannel] }],
        variables: [{ variableName: 'customerName' }],
      };
      templatesRepository.findByIdWithRelations.mockResolvedValue(
        templateWithRelations as any,
      );

      const result = await service.findById(mockTemplate.id!);

      expect(templatesRepository.findByIdWithRelations).toHaveBeenCalledWith(
        mockTemplate.id,
      );
      expect(result.versions).toHaveLength(1);
    });

    it('should throw TS-009 when template not found', async () => {
      templatesRepository.findByIdWithRelations.mockResolvedValue(null);

      await expect(service.findById('nonexistent-id')).rejects.toThrow(
        HttpException,
      );

      try {
        await service.findById('nonexistent-id');
      } catch (error) {
        const response = (error as HttpException).getResponse();
        expect((response as any).code).toBe('TS-009');
      }
    });
  });

  describe('update', () => {
    const updateDto = {
      channels: [
        {
          channel: 'email',
          subject: 'Updated {{orderId}}',
          body: 'Updated {{customerName}}',
        },
      ],
      changeSummary: 'Updated subject line',
      updatedBy: 'editor',
    };

    it('should create a new version on update', async () => {
      templatesRepository.findById.mockResolvedValue(mockTemplate as any);
      templatesRepository.findByIdWithRelations.mockResolvedValue({
        ...mockTemplate,
        versions: [mockVersion],
        variables: [],
      } as any);

      const result = await service.update(mockTemplate.id!, updateDto);

      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw TS-009 when template not found on update', async () => {
      templatesRepository.findById.mockResolvedValue(null);

      await expect(
        service.update('nonexistent-id', updateDto),
      ).rejects.toThrow(HttpException);

      try {
        await service.update('nonexistent-id', updateDto);
      } catch (error) {
        const response = (error as HttpException).getResponse();
        expect((response as any).code).toBe('TS-009');
      }
    });

    it('should throw TS-003 on invalid Handlebars syntax during update', async () => {
      templatesRepository.findById.mockResolvedValue(mockTemplate as any);

      const badDto = {
        channels: [{ channel: 'sms', body: '{{#if}}' }],
        changeSummary: 'Test fix',
      };

      await expect(
        service.update(mockTemplate.id!, badDto),
      ).rejects.toThrow(HttpException);

      try {
        await service.update(mockTemplate.id!, badDto);
      } catch (error) {
        const response = (error as HttpException).getResponse();
        expect((response as any).code).toBe('TS-003');
      }
    });

    it('should increment version number', async () => {
      templatesRepository.findById.mockResolvedValue(mockTemplate as any);

      mockRepos[TemplateVersion.name].createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ maxVersion: 3 }),
      });

      templatesRepository.findByIdWithRelations.mockResolvedValue({
        ...mockTemplate,
        versions: [],
        variables: [],
      } as any);

      await service.update(mockTemplate.id!, updateDto);

      const versionCreate = mockRepos[TemplateVersion.name].create;
      expect(versionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          versionNumber: 4,
          changeSummary: 'Updated subject line',
        }),
      );
    });

    it('should throw TS-003 on duplicate channels during update', async () => {
      templatesRepository.findById.mockResolvedValue(mockTemplate as any);

      const badDto = {
        channels: [
          { channel: 'sms', body: 'Body1' },
          { channel: 'sms', body: 'Body2' },
        ],
        changeSummary: 'Test duplicate',
      };

      await expect(
        service.update(mockTemplate.id!, badDto),
      ).rejects.toThrow(HttpException);

      try {
        await service.update(mockTemplate.id!, badDto);
      } catch (error) {
        const response = (error as HttpException).getResponse();
        expect((response as any).code).toBe('TS-003');
        expect((response as any).message).toContain('Duplicate channel: sms');
      }
    });

    it('should remove old variables and add new ones', async () => {
      templatesRepository.findById.mockResolvedValue(mockTemplate as any);

      const existingVars = [
        { id: 'v1', templateId: mockTemplate.id, variableName: 'oldVar' },
      ];
      mockRepos[TemplateVariable.name].find.mockResolvedValue(existingVars);

      variableDetector.detectVariables.mockReturnValue(['newVar']);

      templatesRepository.findByIdWithRelations.mockResolvedValue({
        ...mockTemplate,
        versions: [],
        variables: [{ variableName: 'newVar' }],
      } as any);

      await service.update(mockTemplate.id!, updateDto);

      expect(mockRepos[TemplateVariable.name].remove).toHaveBeenCalledWith(
        existingVars,
      );
      expect(mockRepos[TemplateVariable.name].create).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should soft delete by setting isActive to false', async () => {
      templatesRepository.findById.mockResolvedValue({
        ...mockTemplate,
      } as any);
      templatesRepository.save.mockResolvedValue({
        ...mockTemplate,
        isActive: false,
      } as any);

      const result = await service.delete(mockTemplate.id!);

      expect(templatesRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
      expect(result.isActive).toBe(false);
    });

    it('should throw TS-009 when template not found on delete', async () => {
      templatesRepository.findById.mockResolvedValue(null);

      await expect(service.delete('nonexistent-id')).rejects.toThrow(
        HttpException,
      );

      try {
        await service.delete('nonexistent-id');
      } catch (error) {
        const response = (error as HttpException).getResponse();
        expect((response as any).code).toBe('TS-009');
      }
    });

    it('should call auditPublisher.publishTemplateDeleted', async () => {
      templatesRepository.findById.mockResolvedValue({ ...mockTemplate } as any);
      templatesRepository.save.mockResolvedValue({ ...mockTemplate, isActive: false } as any);

      await service.delete(mockTemplate.id!);

      expect(mockAuditPublisher.publishTemplateDeleted).toHaveBeenCalledWith(mockTemplate.id);
    });
  });

  describe('rollback', () => {
    const version1: any = {
      id: '22222222-2222-2222-2222-222222222222',
      versionNumber: 1,
    };
    const version2: any = {
      id: '33333333-3333-3333-3333-333333333333',
      versionNumber: 2,
    };

    it('should rollback to a valid version', async () => {
      const templateWithVersions = {
        ...mockTemplate,
        currentVersionId: version2.id,
        versions: [version2, version1],
      };
      templatesRepository.findByIdWithRelations
        .mockResolvedValueOnce(templateWithVersions as any)
        .mockResolvedValueOnce({ ...templateWithVersions, currentVersionId: version1.id } as any);
      templatesRepository.save.mockResolvedValue({} as any);

      const result = await service.rollback(mockTemplate.id!, { versionNumber: 1 });

      expect(templatesRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ currentVersionId: version1.id }),
      );
      expect(result).toBeDefined();
    });

    it('should throw TS-009 when template not found', async () => {
      templatesRepository.findByIdWithRelations.mockResolvedValue(null);

      await expect(
        service.rollback('nonexistent-id', { versionNumber: 1 }),
      ).rejects.toThrow(HttpException);

      try {
        await service.rollback('nonexistent-id', { versionNumber: 1 });
      } catch (error) {
        const response = (error as HttpException).getResponse();
        expect((response as any).code).toBe('TS-009');
      }
    });

    it('should throw TS-011 when version does not exist', async () => {
      const templateWithVersions = {
        ...mockTemplate,
        currentVersionId: version1.id,
        versions: [version1],
      };
      templatesRepository.findByIdWithRelations.mockResolvedValue(templateWithVersions as any);

      await expect(
        service.rollback(mockTemplate.id!, { versionNumber: 99 }),
      ).rejects.toThrow(HttpException);

      try {
        await service.rollback(mockTemplate.id!, { versionNumber: 99 });
      } catch (error) {
        const response = (error as HttpException).getResponse();
        expect((response as any).code).toBe('TS-011');
        expect((response as any).message).toContain('Version 99');
      }
    });

    it('should throw TS-011 when already at the target version', async () => {
      const templateWithVersions = {
        ...mockTemplate,
        currentVersionId: version1.id,
        versions: [version1],
      };
      templatesRepository.findByIdWithRelations.mockResolvedValue(templateWithVersions as any);

      await expect(
        service.rollback(mockTemplate.id!, { versionNumber: 1 }),
      ).rejects.toThrow(HttpException);

      try {
        await service.rollback(mockTemplate.id!, { versionNumber: 1 });
      } catch (error) {
        const response = (error as HttpException).getResponse();
        expect((response as any).code).toBe('TS-011');
        expect((response as any).message).toContain('already at version');
      }
    });

    it('should call auditPublisher.publishTemplateRolledback', async () => {
      const templateWithVersions = {
        ...mockTemplate,
        currentVersionId: version2.id,
        versions: [version2, version1],
      };
      templatesRepository.findByIdWithRelations
        .mockResolvedValueOnce(templateWithVersions as any)
        .mockResolvedValueOnce({ ...templateWithVersions, currentVersionId: version1.id } as any);
      templatesRepository.save.mockResolvedValue({} as any);

      await service.rollback(mockTemplate.id!, { versionNumber: 1 });

      expect(mockAuditPublisher.publishTemplateRolledback).toHaveBeenCalledWith(
        expect.objectContaining({ id: mockTemplate.id }),
        2,
        1,
      );
    });

    it('should invalidate cache on rollback', async () => {
      const mockCache = { invalidate: jest.fn() };
      const serviceWithCache = new TemplatesService(
        mockDataSource,
        templatesRepository,
        variableDetector,
        mockCache as any,
        mockAuditPublisher,
      );

      const templateWithVersions = {
        ...mockTemplate,
        currentVersionId: version2.id,
        versions: [version2, version1],
      };
      templatesRepository.findByIdWithRelations
        .mockResolvedValueOnce(templateWithVersions as any)
        .mockResolvedValueOnce({ ...templateWithVersions, currentVersionId: version1.id } as any);
      templatesRepository.save.mockResolvedValue({} as any);

      await serviceWithCache.rollback(mockTemplate.id!, { versionNumber: 1 });

      expect(mockCache.invalidate).toHaveBeenCalledWith(mockTemplate.id);
    });
  });

  describe('metrics integration', () => {
    it('should increment crud create and version created on create', async () => {
      templatesRepository.existsBySlug.mockResolvedValue(false);

      await service.create({
        slug: 'test',
        name: 'Test',
        channels: [{ channel: 'sms', body: 'Hello' }],
      });

      expect(mockMetricsService.incrementCrudTotal).toHaveBeenCalledWith('create');
      expect(mockMetricsService.incrementVersionCreated).toHaveBeenCalled();
    });

    it('should increment crud update and version created on update', async () => {
      templatesRepository.findById.mockResolvedValue(mockTemplate as any);
      templatesRepository.findByIdWithRelations.mockResolvedValue({
        ...mockTemplate,
        versions: [mockVersion],
        variables: [],
      } as any);

      await service.update(mockTemplate.id!, {
        channels: [{ channel: 'sms', body: 'Updated' }],
        changeSummary: 'Test update',
      });

      expect(mockMetricsService.incrementCrudTotal).toHaveBeenCalledWith('update');
      expect(mockMetricsService.incrementVersionCreated).toHaveBeenCalled();
    });

    it('should increment crud delete on delete', async () => {
      templatesRepository.findById.mockResolvedValue({ ...mockTemplate } as any);
      templatesRepository.save.mockResolvedValue({ ...mockTemplate, isActive: false } as any);

      await service.delete(mockTemplate.id!);

      expect(mockMetricsService.incrementCrudTotal).toHaveBeenCalledWith('delete');
    });

    it('should increment crud rollback on rollback', async () => {
      const version1: any = { id: '22222222-2222-2222-2222-222222222222', versionNumber: 1 };
      const version2: any = { id: '33333333-3333-3333-3333-333333333333', versionNumber: 2 };
      const templateWithVersions = {
        ...mockTemplate,
        currentVersionId: version2.id,
        versions: [version2, version1],
      };
      templatesRepository.findByIdWithRelations
        .mockResolvedValueOnce(templateWithVersions as any)
        .mockResolvedValueOnce({ ...templateWithVersions, currentVersionId: version1.id } as any);
      templatesRepository.save.mockResolvedValue({} as any);

      await service.rollback(mockTemplate.id!, { versionNumber: 1 });

      expect(mockMetricsService.incrementCrudTotal).toHaveBeenCalledWith('rollback');
    });

    it('should not throw when metricsService is not available', async () => {
      const serviceNoMetrics = new TemplatesService(
        mockDataSource,
        templatesRepository,
        variableDetector,
      );

      templatesRepository.existsBySlug.mockResolvedValue(false);

      await expect(
        serviceNoMetrics.create({
          slug: 'test',
          name: 'Test',
          channels: [{ channel: 'sms', body: 'Hello' }],
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('audit publishing integration', () => {
    it('should call auditPublisher.publishTemplateCreated on create', async () => {
      templatesRepository.existsBySlug.mockResolvedValue(false);

      const createDto = {
        slug: 'test',
        name: 'Test',
        channels: [{ channel: 'sms', body: 'Hello' }],
      };

      await service.create(createDto);

      expect(mockAuditPublisher.publishTemplateCreated).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'test' }),
      );
    });

    it('should call auditPublisher.publishTemplateUpdated on update', async () => {
      templatesRepository.findById.mockResolvedValue(mockTemplate as any);
      templatesRepository.findByIdWithRelations.mockResolvedValue({
        ...mockTemplate,
        versions: [{ ...mockVersion, versionNumber: 2 }],
        variables: [],
      } as any);

      const updateDto = {
        channels: [{ channel: 'sms', body: 'Updated' }],
        changeSummary: 'Test update',
      };

      await service.update(mockTemplate.id!, updateDto);

      expect(mockAuditPublisher.publishTemplateUpdated).toHaveBeenCalled();
    });

    it('should not throw when auditPublisher is not available', async () => {
      const serviceNoAudit = new TemplatesService(
        mockDataSource,
        templatesRepository,
        variableDetector,
      );

      templatesRepository.existsBySlug.mockResolvedValue(false);

      const createDto = {
        slug: 'test',
        name: 'Test',
        channels: [{ channel: 'sms', body: 'Hello' }],
      };

      await expect(serviceNoAudit.create(createDto)).resolves.toBeDefined();
    });
  });
});
