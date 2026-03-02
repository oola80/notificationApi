import { HttpException } from '@nestjs/common';
import { RenderingService } from './rendering.service.js';
import { TemplateCacheService, CompiledTemplate } from './template-cache.service.js';
import { MetricsService } from '../../metrics/metrics.service.js';
import { ConfigService } from '@nestjs/config';
import Handlebars from 'handlebars';

describe('RenderingService', () => {
  let service: RenderingService;
  let templateRepo: any;
  let versionRepo: any;
  let channelRepo: any;
  let variableRepo: any;
  let cacheService: jest.Mocked<TemplateCacheService>;
  let metricsService: jest.Mocked<MetricsService>;
  let configService: jest.Mocked<ConfigService>;

  const templateId = '11111111-1111-1111-1111-111111111111';
  const versionId = '22222222-2222-2222-2222-222222222222';

  const mockTemplate = {
    id: templateId,
    slug: 'order-confirmation',
    name: 'Order Confirmation',
    isActive: true,
    currentVersionId: versionId,
  };

  const mockVersion = {
    id: versionId,
    templateId,
    versionNumber: 1,
  };

  const mockChannel = {
    id: '33333333-3333-3333-3333-333333333333',
    templateVersionId: versionId,
    channel: 'email',
    subject: 'Order {{orderId}}',
    body: 'Hello {{customerName}}, your order {{orderId}} is confirmed.',
  };

  beforeEach(() => {
    templateRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    versionRepo = {
      findOne: jest.fn(),
    };

    channelRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    variableRepo = {
      find: jest.fn(),
    };

    cacheService = {
      get: jest.fn(),
      set: jest.fn(),
      invalidate: jest.fn(),
      invalidateAll: jest.fn(),
      getStats: jest.fn(),
    } as any;

    metricsService = {
      observeRenderDuration: jest.fn(),
      incrementRenderTotal: jest.fn(),
      incrementCacheHit: jest.fn(),
      incrementCacheMiss: jest.fn(),
      setCacheSize: jest.fn(),
    } as any;

    configService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const map: Record<string, any> = {
          'app.smsWarnLength': 160,
          'app.smsMaxLength': 1600,
          'app.whatsappMaxLength': 4096,
          'app.pushMaxLength': 256,
          'app.renderTimeoutMs': 5000,
        };
        return map[key] ?? defaultValue;
      }),
    } as any;

    service = new RenderingService(
      templateRepo,
      versionRepo,
      channelRepo,
      variableRepo,
      cacheService,
      metricsService,
      configService,
    );
  });

  describe('render', () => {
    it('should render on cache miss, compile and return result', async () => {
      templateRepo.findOne.mockResolvedValue(mockTemplate);
      versionRepo.findOne.mockResolvedValue(mockVersion);
      cacheService.get.mockReturnValue(undefined);
      channelRepo.findOne.mockResolvedValue(mockChannel);
      variableRepo.find.mockResolvedValue([]);

      const result = await service.render(templateId, {
        channel: 'email',
        data: { orderId: '12345', customerName: 'Alice' },
      });

      expect(result.rendered.subject).toBe('Order 12345');
      expect(result.rendered.body).toContain('Hello Alice');
      expect(result.metadata.templateId).toBe(templateId);
      expect(result.metadata.versionNumber).toBe(1);
      expect(result.metadata.channel).toBe('email');
      expect(cacheService.set).toHaveBeenCalled();
    });

    it('should use cache hit path without fetching channel content', async () => {
      const compiled: CompiledTemplate = {
        subjectFn: Handlebars.compile('Cached {{orderId}}'),
        bodyFn: Handlebars.compile('Cached body {{customerName}}'),
        channelMetadata: {},
      };

      templateRepo.findOne.mockResolvedValue(mockTemplate);
      versionRepo.findOne.mockResolvedValue(mockVersion);
      cacheService.get.mockReturnValue(compiled);
      variableRepo.find.mockResolvedValue([]);

      const result = await service.render(templateId, {
        channel: 'email',
        data: { orderId: '12345', customerName: 'Bob' },
      });

      expect(result.rendered.subject).toBe('Cached 12345');
      expect(result.rendered.body).toBe('Cached body Bob');
      expect(channelRepo.findOne).not.toHaveBeenCalled();
      expect(cacheService.set).not.toHaveBeenCalled();
    });

    it('should use explicit versionNumber when provided', async () => {
      const version2 = { ...mockVersion, id: 'v2-id', versionNumber: 2 };
      templateRepo.findOne.mockResolvedValue(mockTemplate);
      versionRepo.findOne.mockResolvedValue(version2);
      cacheService.get.mockReturnValue(undefined);
      channelRepo.findOne.mockResolvedValue({
        ...mockChannel,
        templateVersionId: 'v2-id',
      });
      variableRepo.find.mockResolvedValue([]);

      const result = await service.render(templateId, {
        channel: 'email',
        data: { orderId: '999', customerName: 'Carol' },
        versionNumber: 2,
      });

      expect(versionRepo.findOne).toHaveBeenCalledWith({
        where: { templateId, versionNumber: 2 },
      });
      expect(result.metadata.versionNumber).toBe(2);
    });

    it('should default to currentVersionId when no versionNumber', async () => {
      templateRepo.findOne.mockResolvedValue(mockTemplate);
      versionRepo.findOne.mockResolvedValue(mockVersion);
      cacheService.get.mockReturnValue(undefined);
      channelRepo.findOne.mockResolvedValue(mockChannel);
      variableRepo.find.mockResolvedValue([]);

      await service.render(templateId, {
        channel: 'email',
        data: { orderId: '123', customerName: 'Dave' },
      });

      expect(versionRepo.findOne).toHaveBeenCalledWith({
        where: { id: versionId },
      });
    });

    it('should throw TS-009 when template not found', async () => {
      templateRepo.findOne.mockResolvedValue(null);

      await expect(
        service.render(templateId, {
          channel: 'email',
          data: { orderId: '123' },
        }),
      ).rejects.toThrow(HttpException);

      try {
        await service.render(templateId, {
          channel: 'email',
          data: { orderId: '123' },
        });
      } catch (error) {
        expect((error as HttpException).getResponse()).toMatchObject({
          code: 'TS-009',
        });
      }
    });

    it('should throw TS-004 when template is inactive', async () => {
      templateRepo.findOne.mockResolvedValue({
        ...mockTemplate,
        isActive: false,
      });

      try {
        await service.render(templateId, {
          channel: 'email',
          data: { orderId: '123' },
        });
        fail('Expected TS-004 error');
      } catch (error) {
        expect((error as HttpException).getResponse()).toMatchObject({
          code: 'TS-004',
        });
      }
    });

    it('should throw TS-010 when version not found', async () => {
      templateRepo.findOne.mockResolvedValue(mockTemplate);
      versionRepo.findOne.mockResolvedValue(null);

      try {
        await service.render(templateId, {
          channel: 'email',
          data: { orderId: '123' },
          versionNumber: 99,
        });
        fail('Expected TS-010 error');
      } catch (error) {
        expect((error as HttpException).getResponse()).toMatchObject({
          code: 'TS-010',
        });
      }
    });

    it('should throw TS-006 with list of missing required variables', async () => {
      templateRepo.findOne.mockResolvedValue(mockTemplate);
      versionRepo.findOne.mockResolvedValue(mockVersion);
      cacheService.get.mockReturnValue(undefined);
      channelRepo.findOne.mockResolvedValue(mockChannel);
      variableRepo.find.mockResolvedValue([
        { variableName: 'orderId', isRequired: true },
        { variableName: 'customerName', isRequired: true },
      ]);

      try {
        await service.render(templateId, {
          channel: 'email',
          data: { orderId: '123' },
        });
        fail('Expected TS-006 error');
      } catch (error) {
        const response = (error as HttpException).getResponse() as any;
        expect(response.code).toBe('TS-006');
        expect(response.message).toContain('customerName');
      }
    });

    it('should throw TS-009 when channel not configured for version', async () => {
      templateRepo.findOne.mockResolvedValue(mockTemplate);
      versionRepo.findOne.mockResolvedValue(mockVersion);
      cacheService.get.mockReturnValue(undefined);
      channelRepo.findOne.mockResolvedValue(null);

      try {
        await service.render(templateId, {
          channel: 'sms',
          data: { orderId: '123' },
        });
        fail('Expected TS-009 error');
      } catch (error) {
        const response = (error as HttpException).getResponse() as any;
        expect(response.code).toBe('TS-009');
        expect(response.message).toContain("Channel 'sms' not found");
      }
    });

    it('should throw TS-005 on Handlebars execution error', async () => {
      const badCompiled: CompiledTemplate = {
        subjectFn: null,
        bodyFn: jest.fn().mockImplementation(() => {
          throw new Error('Handlebars runtime error');
        }) as any,
        channelMetadata: {},
      };

      templateRepo.findOne.mockResolvedValue(mockTemplate);
      versionRepo.findOne.mockResolvedValue(mockVersion);
      cacheService.get.mockReturnValue(badCompiled);
      variableRepo.find.mockResolvedValue([]);

      try {
        await service.render(templateId, {
          channel: 'email',
          data: {},
        });
        fail('Expected TS-005 error');
      } catch (error) {
        expect((error as HttpException).getResponse()).toMatchObject({
          code: 'TS-005',
        });
      }
    });

    it('should produce SMS warning when body exceeds 160 chars', async () => {
      const longBody = 'x'.repeat(200);
      const compiled: CompiledTemplate = {
        subjectFn: null,
        bodyFn: Handlebars.compile(longBody),
        channelMetadata: {},
      };

      templateRepo.findOne.mockResolvedValue(mockTemplate);
      versionRepo.findOne.mockResolvedValue(mockVersion);
      cacheService.get.mockReturnValue(compiled);
      variableRepo.find.mockResolvedValue([]);

      const result = await service.render(templateId, {
        channel: 'sms',
        data: {},
      });

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('160');
    });

    it('should produce SMS strong warning when body exceeds 1600 chars', async () => {
      const veryLongBody = 'x'.repeat(1700);
      const compiled: CompiledTemplate = {
        subjectFn: null,
        bodyFn: Handlebars.compile(veryLongBody),
        channelMetadata: {},
      };

      templateRepo.findOne.mockResolvedValue(mockTemplate);
      versionRepo.findOne.mockResolvedValue(mockVersion);
      cacheService.get.mockReturnValue(compiled);
      variableRepo.find.mockResolvedValue([]);

      const result = await service.render(templateId, {
        channel: 'sms',
        data: {},
      });

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('1600');
      expect(result.warnings[0]).toContain('rejected');
    });

    it('should produce WhatsApp warning when body exceeds 4096 chars', async () => {
      const longBody = 'x'.repeat(5000);
      const compiled: CompiledTemplate = {
        subjectFn: null,
        bodyFn: Handlebars.compile(longBody),
        channelMetadata: {},
      };

      templateRepo.findOne.mockResolvedValue(mockTemplate);
      versionRepo.findOne.mockResolvedValue(mockVersion);
      cacheService.get.mockReturnValue(compiled);
      variableRepo.find.mockResolvedValue([]);

      const result = await service.render(templateId, {
        channel: 'whatsapp',
        data: {},
      });

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('4096');
    });

    it('should produce push warning when subject+body exceeds 256 chars', async () => {
      const compiled: CompiledTemplate = {
        subjectFn: Handlebars.compile('x'.repeat(100)),
        bodyFn: Handlebars.compile('y'.repeat(200)),
        channelMetadata: {},
      };

      templateRepo.findOne.mockResolvedValue(mockTemplate);
      versionRepo.findOne.mockResolvedValue(mockVersion);
      cacheService.get.mockReturnValue(compiled);
      variableRepo.find.mockResolvedValue([]);

      const result = await service.render(templateId, {
        channel: 'push',
        data: {},
      });

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('256');
    });

    it('should not produce warnings for email channel', async () => {
      const longBody = 'x'.repeat(100000);
      const compiled: CompiledTemplate = {
        subjectFn: Handlebars.compile('Subject'),
        bodyFn: Handlebars.compile(longBody),
        channelMetadata: {},
      };

      templateRepo.findOne.mockResolvedValue(mockTemplate);
      versionRepo.findOne.mockResolvedValue(mockVersion);
      cacheService.get.mockReturnValue(compiled);
      variableRepo.find.mockResolvedValue([]);

      const result = await service.render(templateId, {
        channel: 'email',
        data: {},
      });

      expect(result.warnings).toEqual([]);
    });

    it('should observe render duration and increment render total on success', async () => {
      templateRepo.findOne.mockResolvedValue(mockTemplate);
      versionRepo.findOne.mockResolvedValue(mockVersion);
      cacheService.get.mockReturnValue({
        subjectFn: null,
        bodyFn: Handlebars.compile('body'),
        channelMetadata: {},
      });
      variableRepo.find.mockResolvedValue([]);

      await service.render(templateId, {
        channel: 'email',
        data: {},
      });

      expect(metricsService.observeRenderDuration).toHaveBeenCalledWith(
        'email',
        expect.any(Number),
      );
      expect(metricsService.incrementRenderTotal).toHaveBeenCalledWith(
        'email',
        'success',
      );
    });

    it('should sanitize script tags from email body', async () => {
      const compiled: CompiledTemplate = {
        subjectFn: Handlebars.compile('Subject <b>bold</b>'),
        bodyFn: Handlebars.compile(
          '<p>Hello</p><script>alert("xss")</script><p>World</p>',
        ),
        channelMetadata: {},
      };

      templateRepo.findOne.mockResolvedValue(mockTemplate);
      versionRepo.findOne.mockResolvedValue(mockVersion);
      cacheService.get.mockReturnValue(compiled);
      variableRepo.find.mockResolvedValue([]);

      const result = await service.render(templateId, {
        channel: 'email',
        data: {},
      });

      expect(result.rendered.body).not.toContain('<script>');
      expect(result.rendered.body).toBe('<p>Hello</p><p>World</p>');
      expect(result.rendered.subject).toBe('Subject bold');
    });

    it('should not sanitize non-email channels', async () => {
      const bodyWithTags = '<p>Hello</p><script>alert("xss")</script>';
      const compiled: CompiledTemplate = {
        subjectFn: null,
        bodyFn: Handlebars.compile(bodyWithTags),
        channelMetadata: {},
      };

      templateRepo.findOne.mockResolvedValue(mockTemplate);
      versionRepo.findOne.mockResolvedValue(mockVersion);
      cacheService.get.mockReturnValue(compiled);
      variableRepo.find.mockResolvedValue([]);

      const result = await service.render(templateId, {
        channel: 'sms',
        data: {},
      });

      expect(result.rendered.body).toBe(bodyWithTags);
    });

    it('should include channelMetadata in render response when channel has metadata', async () => {
      const whatsappChannel = {
        ...mockChannel,
        channel: 'whatsapp',
        subject: null,
        body: 'Hola {{customerName}}',
        metadata: { metaTemplateName: 'order_delay', metaTemplateLanguage: 'es_MX' },
      };

      templateRepo.findOne.mockResolvedValue(mockTemplate);
      versionRepo.findOne.mockResolvedValue(mockVersion);
      cacheService.get.mockReturnValue(undefined);
      channelRepo.findOne.mockResolvedValue(whatsappChannel);
      variableRepo.find.mockResolvedValue([]);

      const result = await service.render(templateId, {
        channel: 'whatsapp',
        data: { customerName: 'Juan' },
      });

      expect(result.channelMetadata).toEqual({
        metaTemplateName: 'order_delay',
        metaTemplateLanguage: 'es_MX',
      });
    });

    it('should return empty channelMetadata when channel has no metadata', async () => {
      templateRepo.findOne.mockResolvedValue(mockTemplate);
      versionRepo.findOne.mockResolvedValue(mockVersion);
      cacheService.get.mockReturnValue(undefined);
      channelRepo.findOne.mockResolvedValue(mockChannel);
      variableRepo.find.mockResolvedValue([]);

      const result = await service.render(templateId, {
        channel: 'email',
        data: { orderId: '12345', customerName: 'Alice' },
      });

      expect(result.channelMetadata).toEqual({});
    });

    it('should default channelMetadata to empty object when channel metadata is null', async () => {
      const channelNoMetadata = {
        ...mockChannel,
        metadata: null,
      };

      templateRepo.findOne.mockResolvedValue(mockTemplate);
      versionRepo.findOne.mockResolvedValue(mockVersion);
      cacheService.get.mockReturnValue(undefined);
      channelRepo.findOne.mockResolvedValue(channelNoMetadata);
      variableRepo.find.mockResolvedValue([]);

      const result = await service.render(templateId, {
        channel: 'email',
        data: { orderId: '12345', customerName: 'Alice' },
      });

      expect(result.channelMetadata).toEqual({});
    });

    it('should throw TS-012 when render timeout is exceeded', async () => {
      // Use renderTimeoutMs=0 to trigger immediate timeout
      configService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'app.renderTimeoutMs') return 0;
        const map: Record<string, any> = {
          'app.smsWarnLength': 160,
          'app.smsMaxLength': 1600,
          'app.whatsappMaxLength': 4096,
          'app.pushMaxLength': 256,
        };
        return map[key] ?? defaultValue;
      });

      templateRepo.findOne.mockResolvedValue(mockTemplate);

      try {
        await service.render(templateId, {
          channel: 'email',
          data: {},
        });
        fail('Expected TS-012 error');
      } catch (error) {
        expect((error as HttpException).getResponse()).toMatchObject({
          code: 'TS-012',
        });
      }
    });
  });

  describe('preview', () => {
    it('should render all channels for a template', async () => {
      const smsChannel = {
        ...mockChannel,
        channel: 'sms',
        subject: null,
        body: 'SMS: {{orderId}}',
      };

      templateRepo.findOne.mockResolvedValue(mockTemplate);
      versionRepo.findOne.mockResolvedValue(mockVersion);
      channelRepo.find.mockResolvedValue([mockChannel, smsChannel]);
      cacheService.get.mockReturnValue(undefined);
      variableRepo.find.mockResolvedValue([]);

      const result = await service.preview(templateId, {
        data: { orderId: '123', customerName: 'Eve' },
      });

      expect(result.previews).toHaveLength(2);
      expect(result.previews[0].channel).toBe('email');
      expect(result.previews[0].subject).toBe('Order 123');
      expect(result.previews[1].channel).toBe('sms');
      expect(result.previews[1].body).toContain('SMS: 123');
      expect(result.metadata.templateId).toBe(templateId);
      expect(result.metadata.versionNumber).toBe(1);
    });

    it('should preview with explicit versionNumber', async () => {
      const version2 = { ...mockVersion, id: 'v2-id', versionNumber: 2 };
      templateRepo.findOne.mockResolvedValue(mockTemplate);
      versionRepo.findOne.mockResolvedValue(version2);
      channelRepo.find.mockResolvedValue([mockChannel]);
      cacheService.get.mockReturnValue(undefined);

      const result = await service.preview(templateId, {
        data: { orderId: '123', customerName: 'Eve' },
        versionNumber: 2,
      });

      expect(result.metadata.versionNumber).toBe(2);
    });

    it('should throw TS-004 when template inactive', async () => {
      templateRepo.findOne.mockResolvedValue({
        ...mockTemplate,
        isActive: false,
      });

      try {
        await service.preview(templateId, { data: {} });
        fail('Expected TS-004');
      } catch (error) {
        expect((error as HttpException).getResponse()).toMatchObject({
          code: 'TS-004',
        });
      }
    });

    it('should throw TS-009 when template not found', async () => {
      templateRepo.findOne.mockResolvedValue(null);

      try {
        await service.preview(templateId, { data: {} });
        fail('Expected TS-009');
      } catch (error) {
        expect((error as HttpException).getResponse()).toMatchObject({
          code: 'TS-009',
        });
      }
    });
  });

  describe('warmUp', () => {
    it('should pre-compile active templates on bootstrap', async () => {
      const activeTemplate = {
        id: templateId,
        isActive: true,
        currentVersionId: versionId,
      };

      templateRepo.find.mockResolvedValue([activeTemplate]);
      channelRepo.find.mockResolvedValue([mockChannel]);

      await service.warmUp();

      expect(cacheService.set).toHaveBeenCalledWith(
        `${templateId}:${versionId}:email`,
        expect.objectContaining({
          subjectFn: expect.any(Function),
          bodyFn: expect.any(Function),
          channelMetadata: expect.any(Object),
        }),
      );
    });

    it('should skip templates without currentVersionId', async () => {
      templateRepo.find.mockResolvedValue([
        { id: templateId, isActive: true, currentVersionId: null },
      ]);

      await service.warmUp();

      expect(channelRepo.find).not.toHaveBeenCalled();
      expect(cacheService.set).not.toHaveBeenCalled();
    });
  });
});
