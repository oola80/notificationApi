import { HttpException, HttpStatus } from '@nestjs/common';
import { RenderingController } from './rendering.controller.js';
import { RenderingService } from './services/rendering.service.js';

describe('RenderingController', () => {
  let controller: RenderingController;
  let renderingService: jest.Mocked<RenderingService>;

  const templateId = '11111111-1111-1111-1111-111111111111';

  const mockRenderResult = {
    rendered: {
      subject: 'Order 12345',
      body: 'Hello Alice, your order is confirmed.',
    },
    metadata: {
      templateId,
      versionNumber: 1,
      channel: 'email',
      renderedAt: '2026-01-01T00:00:00.000Z',
      renderDurationMs: 2.5,
    },
    warnings: [],
  };

  const mockPreviewResult = {
    previews: [
      {
        channel: 'email',
        subject: 'Order 12345',
        body: 'Hello Alice',
        warnings: [],
      },
      {
        channel: 'sms',
        body: 'Order 12345 confirmed',
        warnings: [],
      },
    ],
    metadata: {
      templateId,
      versionNumber: 1,
      renderedAt: '2026-01-01T00:00:00.000Z',
    },
  };

  beforeEach(() => {
    renderingService = {
      render: jest.fn(),
      preview: jest.fn(),
      warmUp: jest.fn(),
      onApplicationBootstrap: jest.fn(),
    } as any;

    controller = new RenderingController(renderingService);
  });

  describe('POST /templates/:id/render', () => {
    it('should return 200 with rendered content', async () => {
      renderingService.render.mockResolvedValue(mockRenderResult);

      const result = await controller.render(templateId, {
        channel: 'email',
        data: { orderId: '12345', customerName: 'Alice' },
      });

      expect(result).toEqual(mockRenderResult);
      expect(renderingService.render).toHaveBeenCalledWith(templateId, {
        channel: 'email',
        data: { orderId: '12345', customerName: 'Alice' },
      });
    });

    it('should pass explicit versionNumber to service', async () => {
      renderingService.render.mockResolvedValue(mockRenderResult);

      await controller.render(templateId, {
        channel: 'email',
        data: { orderId: '12345' },
        versionNumber: 2,
      });

      expect(renderingService.render).toHaveBeenCalledWith(templateId, {
        channel: 'email',
        data: { orderId: '12345' },
        versionNumber: 2,
      });
    });

    it('should propagate TS-009 (template not found)', async () => {
      renderingService.render.mockRejectedValue(
        new HttpException(
          { code: 'TS-009', status: 404, message: 'Not found', details: 'TEMPLATE_NOT_FOUND' },
          HttpStatus.NOT_FOUND,
        ),
      );

      await expect(
        controller.render(templateId, {
          channel: 'email',
          data: {},
        }),
      ).rejects.toThrow(HttpException);
    });

    it('should propagate TS-006 (missing required variables)', async () => {
      renderingService.render.mockRejectedValue(
        new HttpException(
          { code: 'TS-006', status: 422, message: 'Missing vars', details: 'VARIABLE_MISSING' },
          HttpStatus.UNPROCESSABLE_ENTITY,
        ),
      );

      await expect(
        controller.render(templateId, {
          channel: 'email',
          data: {},
        }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('POST /templates/:id/preview', () => {
    it('should return 200 with all channel previews', async () => {
      renderingService.preview.mockResolvedValue(mockPreviewResult);

      const result = await controller.preview(templateId, {
        data: { orderId: '12345', customerName: 'Alice' },
      });

      expect(result).toEqual(mockPreviewResult);
      expect(renderingService.preview).toHaveBeenCalledWith(templateId, {
        data: { orderId: '12345', customerName: 'Alice' },
      });
    });

    it('should propagate TS-009 (template not found)', async () => {
      renderingService.preview.mockRejectedValue(
        new HttpException(
          { code: 'TS-009', status: 404, message: 'Not found', details: 'TEMPLATE_NOT_FOUND' },
          HttpStatus.NOT_FOUND,
        ),
      );

      await expect(
        controller.preview(templateId, { data: {} }),
      ).rejects.toThrow(HttpException);
    });

    it('should pass versionNumber to service', async () => {
      renderingService.preview.mockResolvedValue(mockPreviewResult);

      await controller.preview(templateId, {
        data: { orderId: '12345' },
        versionNumber: 3,
      });

      expect(renderingService.preview).toHaveBeenCalledWith(templateId, {
        data: { orderId: '12345' },
        versionNumber: 3,
      });
    });
  });
});
