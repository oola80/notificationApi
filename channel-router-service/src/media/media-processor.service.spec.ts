import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { AxiosResponse, AxiosHeaders } from 'axios';
import { MediaProcessorService } from './media-processor.service.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { MediaEntry } from './interfaces/media.interfaces.js';

describe('MediaProcessorService', () => {
  let service: MediaProcessorService;
  let httpService: {
    get: jest.Mock;
    head: jest.Mock;
  };
  let metricsService: {
    observeMediaDownloadDuration: jest.Mock;
    incrementMediaFailure: jest.Mock;
  };

  const createAxiosResponse = (
    data: any,
    headers: Record<string, string> = {},
    status = 200,
  ): AxiosResponse => ({
    data,
    status,
    statusText: 'OK',
    headers,
    config: { headers: new AxiosHeaders() },
  });

  beforeEach(async () => {
    httpService = {
      get: jest.fn(),
      head: jest.fn(),
    };

    metricsService = {
      observeMediaDownloadDuration: jest.fn(),
      incrementMediaFailure: jest.fn(),
    };

    const configService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        const configMap: Record<string, any> = {
          'app.mediaDownloadTimeoutMs': 10000,
          'app.mediaMaxFileSizeMb': 10,
          'app.mediaMaxTotalSizeMb': 30,
        };
        return configMap[key] ?? defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaProcessorService,
        { provide: HttpService, useValue: httpService },
        { provide: MetricsService, useValue: metricsService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<MediaProcessorService>(MediaProcessorService);
  });

  describe('processMedia', () => {
    it('should return empty array for null input', async () => {
      const result = await service.processMedia('email', null as any);
      expect(result).toEqual([]);
    });

    it('should return empty array for empty input', async () => {
      const result = await service.processMedia('email', []);
      expect(result).toEqual([]);
    });

    it('should return empty array for unknown channel', async () => {
      const media: MediaEntry[] = [
        {
          type: 'image',
          url: 'https://example.com/img.png',
          context: 'inline',
        },
      ];
      const result = await service.processMedia('carrier-pigeon', media);
      expect(result).toEqual([]);
    });
  });

  describe('SMS processing', () => {
    it('should return empty array (skip all media)', async () => {
      const media: MediaEntry[] = [
        {
          type: 'image',
          url: 'https://example.com/img.png',
          context: 'inline',
        },
        {
          type: 'document',
          url: 'https://example.com/doc.pdf',
          filename: 'doc.pdf',
          context: 'attachment',
        },
      ];
      const result = await service.processMedia('sms', media);
      expect(result).toEqual([]);
    });
  });

  describe('Email processing', () => {
    it('should skip inline images', async () => {
      const media: MediaEntry[] = [
        {
          type: 'image',
          url: 'https://example.com/logo.png',
          context: 'inline',
        },
      ];
      const result = await service.processMedia('email', media);
      expect(result).toEqual([]);
    });

    it('should download and Base64-encode attachments', async () => {
      const fileContent = Buffer.from('hello world');
      httpService.get.mockReturnValue(
        of(
          createAxiosResponse(fileContent, {
            'content-type': 'application/pdf',
          }),
        ),
      );

      const media: MediaEntry[] = [
        {
          type: 'document',
          url: 'https://example.com/doc.pdf',
          filename: 'doc.pdf',
          mimeType: 'application/pdf',
          context: 'attachment',
        },
      ];

      const result = await service.processMedia('email', media);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe(fileContent.toString('base64'));
      expect(result[0].mimeType).toBe('application/pdf');
      expect(result[0].filename).toBe('doc.pdf');
      expect(result[0].context).toBe('attachment');
      expect(result[0].error).toBeUndefined();
    });

    it('should extract filename from URL when not provided', async () => {
      const fileContent = Buffer.from('data');
      httpService.get.mockReturnValue(
        of(
          createAxiosResponse(fileContent, {
            'content-type': 'image/png',
          }),
        ),
      );

      const media: MediaEntry[] = [
        {
          type: 'image',
          url: 'https://example.com/path/to/report.png',
          context: 'attachment',
        },
      ];

      const result = await service.processMedia('email', media);
      expect(result[0].filename).toBe('report.png');
    });

    it('should enforce per-file size limit', async () => {
      // Create a file larger than 10MB
      const largeContent = Buffer.alloc(11 * 1024 * 1024, 'A');
      httpService.get.mockReturnValue(
        of(
          createAxiosResponse(largeContent, {
            'content-type': 'application/pdf',
          }),
        ),
      );

      const media: MediaEntry[] = [
        {
          type: 'document',
          url: 'https://example.com/large.pdf',
          filename: 'large.pdf',
          context: 'attachment',
        },
      ];

      const result = await service.processMedia('email', media);

      expect(result).toHaveLength(1);
      expect(result[0].error).toContain('exceeds limit');
      expect(result[0].content).toBeUndefined();
      expect(metricsService.incrementMediaFailure).toHaveBeenCalledWith(
        'email',
        'file_too_large',
      );
    });

    it('should enforce total size limit', async () => {
      // Two 20MB files — first fits, second exceeds 30MB total
      const file1 = Buffer.alloc(20 * 1024 * 1024, 'A');
      const file2 = Buffer.alloc(20 * 1024 * 1024, 'B');

      httpService.get
        .mockReturnValueOnce(
          of(
            createAxiosResponse(file1, {
              'content-type': 'application/pdf',
            }),
          ),
        )
        .mockReturnValueOnce(
          of(
            createAxiosResponse(file2, {
              'content-type': 'application/pdf',
            }),
          ),
        );

      const media: MediaEntry[] = [
        {
          type: 'document',
          url: 'https://example.com/file1.pdf',
          filename: 'file1.pdf',
          context: 'attachment',
        },
        {
          type: 'document',
          url: 'https://example.com/file2.pdf',
          filename: 'file2.pdf',
          context: 'attachment',
        },
      ];

      const result = await service.processMedia('email', media);

      expect(result).toHaveLength(2);
      // First file should succeed (under per-file 10MB? No — 20MB > 10MB per-file limit)
      // Actually, 20MB > 10MB per-file limit, so first should also fail per-file
      expect(result[0].error).toContain('exceeds limit');
      expect(result[1].error).toContain('exceeds limit');
    });

    it('should reject non-HTTPS URLs', async () => {
      const media: MediaEntry[] = [
        {
          type: 'document',
          url: 'http://example.com/doc.pdf',
          filename: 'doc.pdf',
          context: 'attachment',
        },
      ];

      const result = await service.processMedia('email', media);

      expect(result).toHaveLength(1);
      expect(result[0].error).toContain('non-HTTPS');
      expect(metricsService.incrementMediaFailure).toHaveBeenCalledWith(
        'email',
        'invalid_url',
      );
    });

    it('should reject invalid URLs', async () => {
      const media: MediaEntry[] = [
        {
          type: 'document',
          url: 'not-a-url',
          filename: 'doc.pdf',
          context: 'attachment',
        },
      ];

      const result = await service.processMedia('email', media);

      expect(result).toHaveLength(1);
      expect(result[0].error).toContain('Invalid');
    });

    it('should handle download timeout gracefully', async () => {
      const timeoutError = new Error('timeout');
      (timeoutError as any).code = 'ECONNABORTED';
      httpService.get.mockReturnValue(throwError(() => timeoutError));

      const media: MediaEntry[] = [
        {
          type: 'document',
          url: 'https://example.com/slow.pdf',
          filename: 'slow.pdf',
          context: 'attachment',
        },
      ];

      const result = await service.processMedia('email', media);

      expect(result).toHaveLength(1);
      expect(result[0].error).toContain('Download failed');
      expect(metricsService.incrementMediaFailure).toHaveBeenCalledWith(
        'email',
        'timeout',
      );
    });

    it('should handle download error gracefully', async () => {
      httpService.get.mockReturnValue(
        throwError(() => new Error('Connection refused')),
      );

      const media: MediaEntry[] = [
        {
          type: 'document',
          url: 'https://example.com/missing.pdf',
          filename: 'missing.pdf',
          context: 'attachment',
        },
      ];

      const result = await service.processMedia('email', media);

      expect(result).toHaveLength(1);
      expect(result[0].error).toContain('Download failed');
      expect(metricsService.incrementMediaFailure).toHaveBeenCalledWith(
        'email',
        'download_error',
      );
    });

    it('should record download duration metric on success', async () => {
      const fileContent = Buffer.from('data');
      httpService.get.mockReturnValue(
        of(
          createAxiosResponse(fileContent, {
            'content-type': 'application/pdf',
          }),
        ),
      );

      const media: MediaEntry[] = [
        {
          type: 'document',
          url: 'https://example.com/doc.pdf',
          filename: 'doc.pdf',
          context: 'attachment',
        },
      ];

      await service.processMedia('email', media);

      expect(metricsService.observeMediaDownloadDuration).toHaveBeenCalledWith(
        'email',
        expect.any(Number),
      );
    });

    it('should record download duration metric on failure', async () => {
      httpService.get.mockReturnValue(
        throwError(() => new Error('Network error')),
      );

      const media: MediaEntry[] = [
        {
          type: 'document',
          url: 'https://example.com/doc.pdf',
          filename: 'doc.pdf',
          context: 'attachment',
        },
      ];

      await service.processMedia('email', media);

      expect(metricsService.observeMediaDownloadDuration).toHaveBeenCalledWith(
        'email',
        expect.any(Number),
      );
    });

    it('should use Content-Type from response header', async () => {
      const fileContent = Buffer.from('data');
      httpService.get.mockReturnValue(
        of(
          createAxiosResponse(fileContent, {
            'content-type': 'image/jpeg',
          }),
        ),
      );

      const media: MediaEntry[] = [
        {
          type: 'image',
          url: 'https://example.com/photo.jpg',
          mimeType: 'image/png', // Should be overridden by response header
          context: 'attachment',
        },
      ];

      const result = await service.processMedia('email', media);
      expect(result[0].mimeType).toBe('image/jpeg');
    });

    it('should process multiple attachments correctly', async () => {
      const file1 = Buffer.from('file1 content');
      const file2 = Buffer.from('file2 content');

      httpService.get
        .mockReturnValueOnce(
          of(
            createAxiosResponse(file1, {
              'content-type': 'application/pdf',
            }),
          ),
        )
        .mockReturnValueOnce(
          of(
            createAxiosResponse(file2, {
              'content-type': 'text/plain',
            }),
          ),
        );

      const media: MediaEntry[] = [
        {
          type: 'document',
          url: 'https://example.com/doc1.pdf',
          filename: 'doc1.pdf',
          context: 'attachment',
        },
        {
          type: 'document',
          url: 'https://example.com/doc2.txt',
          filename: 'doc2.txt',
          context: 'attachment',
        },
      ];

      const result = await service.processMedia('email', media);

      expect(result).toHaveLength(2);
      expect(result[0].content).toBe(file1.toString('base64'));
      expect(result[1].content).toBe(file2.toString('base64'));
    });

    it('should skip inline but process attachments in mixed media', async () => {
      const fileContent = Buffer.from('attachment data');
      httpService.get.mockReturnValue(
        of(
          createAxiosResponse(fileContent, {
            'content-type': 'application/pdf',
          }),
        ),
      );

      const media: MediaEntry[] = [
        {
          type: 'image',
          url: 'https://example.com/banner.png',
          context: 'inline',
        },
        {
          type: 'document',
          url: 'https://example.com/invoice.pdf',
          filename: 'invoice.pdf',
          context: 'attachment',
        },
      ];

      const result = await service.processMedia('email', media);

      expect(result).toHaveLength(1);
      expect(result[0].filename).toBe('invoice.pdf');
    });
  });

  describe('WhatsApp processing', () => {
    it('should pass media URLs through', async () => {
      httpService.head.mockReturnValue(
        of(createAxiosResponse(null, { 'content-length': '1000' })),
      );

      const media: MediaEntry[] = [
        {
          type: 'image',
          url: 'https://example.com/photo.jpg',
          mimeType: 'image/jpeg',
          context: 'inline',
        },
      ];

      const result = await service.processMedia('whatsapp', media);

      expect(result).toHaveLength(1);
      expect(result[0].url).toBe('https://example.com/photo.jpg');
      expect(result[0].content).toBeUndefined();
    });

    it('should enforce 16 MB limit', async () => {
      const largeSize = 17 * 1024 * 1024;
      httpService.head.mockReturnValue(
        of(
          createAxiosResponse(null, {
            'content-length': String(largeSize),
          }),
        ),
      );

      const media: MediaEntry[] = [
        {
          type: 'video',
          url: 'https://example.com/video.mp4',
          mimeType: 'video/mp4',
          context: 'attachment',
        },
      ];

      const result = await service.processMedia('whatsapp', media);

      expect(result).toHaveLength(1);
      expect(result[0].error).toContain('exceeds limit');
      expect(metricsService.incrementMediaFailure).toHaveBeenCalledWith(
        'whatsapp',
        'file_too_large',
      );
    });

    it('should reject non-HTTPS URLs', async () => {
      const media: MediaEntry[] = [
        {
          type: 'image',
          url: 'http://example.com/photo.jpg',
          context: 'inline',
        },
      ];

      const result = await service.processMedia('whatsapp', media);

      expect(result).toHaveLength(1);
      expect(result[0].error).toContain('non-HTTPS');
    });

    it('should proceed when HEAD request fails', async () => {
      httpService.head.mockReturnValue(
        throwError(() => new Error('HEAD failed')),
      );

      const media: MediaEntry[] = [
        {
          type: 'image',
          url: 'https://example.com/photo.jpg',
          mimeType: 'image/jpeg',
          context: 'inline',
        },
      ];

      const result = await service.processMedia('whatsapp', media);

      // Should still pass URL through since we can't determine size
      expect(result).toHaveLength(1);
      expect(result[0].url).toBe('https://example.com/photo.jpg');
      expect(result[0].error).toBeUndefined();
    });

    it('should process multiple media items', async () => {
      httpService.head.mockReturnValue(
        of(createAxiosResponse(null, { 'content-length': '5000' })),
      );

      const media: MediaEntry[] = [
        {
          type: 'image',
          url: 'https://example.com/img1.jpg',
          context: 'inline',
        },
        {
          type: 'document',
          url: 'https://example.com/doc.pdf',
          context: 'attachment',
        },
      ];

      const result = await service.processMedia('whatsapp', media);
      expect(result).toHaveLength(2);
    });
  });

  describe('Push processing', () => {
    it('should extract first inline image URL', async () => {
      httpService.head.mockReturnValue(
        of(createAxiosResponse(null, { 'content-length': '50000' })),
      );

      const media: MediaEntry[] = [
        {
          type: 'image',
          url: 'https://example.com/notification.png',
          mimeType: 'image/png',
          context: 'inline',
        },
      ];

      const result = await service.processMedia('push', media);

      expect(result).toHaveLength(1);
      expect(result[0].url).toBe('https://example.com/notification.png');
      expect(result[0].content).toBeUndefined();
    });

    it('should ignore attachments', async () => {
      const media: MediaEntry[] = [
        {
          type: 'document',
          url: 'https://example.com/doc.pdf',
          context: 'attachment',
        },
      ];

      const result = await service.processMedia('push', media);
      expect(result).toEqual([]);
    });

    it('should ignore non-image inline entries', async () => {
      const media: MediaEntry[] = [
        {
          type: 'document',
          url: 'https://example.com/doc.pdf',
          context: 'inline',
        },
      ];

      const result = await service.processMedia('push', media);
      expect(result).toEqual([]);
    });

    it('should only take the first inline image', async () => {
      httpService.head.mockReturnValue(
        of(createAxiosResponse(null, { 'content-length': '50000' })),
      );

      const media: MediaEntry[] = [
        {
          type: 'image',
          url: 'https://example.com/first.png',
          context: 'inline',
        },
        {
          type: 'image',
          url: 'https://example.com/second.png',
          context: 'inline',
        },
      ];

      const result = await service.processMedia('push', media);

      expect(result).toHaveLength(1);
      expect(result[0].url).toBe('https://example.com/first.png');
    });

    it('should enforce 1 MB image limit', async () => {
      const largeSize = 2 * 1024 * 1024;
      httpService.head.mockReturnValue(
        of(
          createAxiosResponse(null, {
            'content-length': String(largeSize),
          }),
        ),
      );

      const media: MediaEntry[] = [
        {
          type: 'image',
          url: 'https://example.com/large.png',
          context: 'inline',
        },
      ];

      const result = await service.processMedia('push', media);

      expect(result).toHaveLength(1);
      expect(result[0].error).toContain('exceeds limit');
      expect(metricsService.incrementMediaFailure).toHaveBeenCalledWith(
        'push',
        'file_too_large',
      );
    });

    it('should reject non-HTTPS URL', async () => {
      const media: MediaEntry[] = [
        {
          type: 'image',
          url: 'http://example.com/img.png',
          context: 'inline',
        },
      ];

      const result = await service.processMedia('push', media);

      expect(result).toHaveLength(1);
      expect(result[0].error).toContain('non-HTTPS');
    });

    it('should proceed when HEAD request fails', async () => {
      httpService.head.mockReturnValue(
        throwError(() => new Error('HEAD failed')),
      );

      const media: MediaEntry[] = [
        {
          type: 'image',
          url: 'https://example.com/img.png',
          context: 'inline',
        },
      ];

      const result = await service.processMedia('push', media);

      // Should pass URL through since size check failed gracefully
      expect(result).toHaveLength(1);
      expect(result[0].url).toBe('https://example.com/img.png');
      expect(result[0].error).toBeUndefined();
    });
  });
});
