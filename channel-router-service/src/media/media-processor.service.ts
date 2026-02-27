import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { MetricsService } from '../metrics/metrics.service.js';
import { MediaEntry, ProcessedMedia } from './interfaces/media.interfaces.js';

@Injectable()
export class MediaProcessorService {
  private readonly logger = new Logger(MediaProcessorService.name);

  private readonly downloadTimeoutMs: number;
  private readonly maxFileSizeBytes: number;
  private readonly maxTotalSizeBytes: number;

  // Channel-specific limits (in bytes)
  private readonly channelLimits: Record<
    string,
    { maxPerFile: number; maxTotal: number }
  > = {
    email: { maxPerFile: 10 * 1024 * 1024, maxTotal: 30 * 1024 * 1024 },
    whatsapp: {
      maxPerFile: 16 * 1024 * 1024,
      maxTotal: 16 * 1024 * 1024,
    },
    push: { maxPerFile: 1 * 1024 * 1024, maxTotal: 1 * 1024 * 1024 },
    sms: { maxPerFile: 0, maxTotal: 0 },
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly metricsService: MetricsService,
  ) {
    this.downloadTimeoutMs = this.configService.get<number>(
      'app.mediaDownloadTimeoutMs',
      10000,
    );
    this.maxFileSizeBytes =
      this.configService.get<number>('app.mediaMaxFileSizeMb', 10) *
      1024 *
      1024;
    this.maxTotalSizeBytes =
      this.configService.get<number>('app.mediaMaxTotalSizeMb', 30) *
      1024 *
      1024;

    // Override email limits from config
    this.channelLimits.email.maxPerFile = this.maxFileSizeBytes;
    this.channelLimits.email.maxTotal = this.maxTotalSizeBytes;
  }

  async processMedia(
    channel: string,
    mediaArray: MediaEntry[],
  ): Promise<ProcessedMedia[]> {
    if (!mediaArray || mediaArray.length === 0) {
      return [];
    }

    switch (channel) {
      case 'sms':
        return this.processSms();
      case 'email':
        return this.processEmail(mediaArray);
      case 'whatsapp':
        return this.processWhatsApp(mediaArray);
      case 'push':
        return this.processPush(mediaArray);
      default:
        this.logger.warn(`Unknown channel: ${channel}, skipping media`);
        return [];
    }
  }

  private processSms(): ProcessedMedia[] {
    // SMS: skip all media
    return [];
  }

  private async processEmail(
    mediaArray: MediaEntry[],
  ): Promise<ProcessedMedia[]> {
    const results: ProcessedMedia[] = [];
    let totalSize = 0;

    for (const entry of mediaArray) {
      // Skip inline images — already rendered as <img> by Template Service
      if (entry.context === 'inline') {
        continue;
      }

      // Attachments: download and Base64-encode
      if (entry.context === 'attachment') {
        const limits = this.channelLimits.email;

        const result = await this.downloadAndEncode(entry, 'email');

        if (result.error) {
          results.push(result);
          continue;
        }

        // Check per-file size
        const contentSize = result.content
          ? Buffer.byteLength(result.content, 'base64')
          : 0;

        if (contentSize > limits.maxPerFile) {
          this.metricsService.incrementMediaFailure('email', 'file_too_large');
          this.logger.warn(
            `Email attachment ${entry.filename ?? entry.url} exceeds ${limits.maxPerFile} bytes limit (${contentSize} bytes), skipping`,
          );
          results.push({
            ...result,
            content: undefined,
            error: `File size ${contentSize} exceeds limit ${limits.maxPerFile}`,
          });
          continue;
        }

        // Check total size
        if (totalSize + contentSize > limits.maxTotal) {
          this.metricsService.incrementMediaFailure('email', 'total_too_large');
          this.logger.warn(
            `Email total attachment size would exceed ${limits.maxTotal} bytes limit, skipping ${entry.filename ?? entry.url}`,
          );
          results.push({
            ...result,
            content: undefined,
            error: `Total size would exceed limit ${limits.maxTotal}`,
          });
          continue;
        }

        totalSize += contentSize;
        results.push(result);
      }
    }

    return results;
  }

  private async processWhatsApp(
    mediaArray: MediaEntry[],
  ): Promise<ProcessedMedia[]> {
    const results: ProcessedMedia[] = [];
    const limits = this.channelLimits.whatsapp;
    let totalSize = 0;

    for (const entry of mediaArray) {
      // Validate URL
      if (!this.isValidHttpsUrl(entry.url)) {
        this.metricsService.incrementMediaFailure('whatsapp', 'invalid_url');
        results.push({
          type: entry.type,
          filename: entry.filename,
          mimeType: entry.mimeType,
          url: entry.url,
          context: entry.context,
          error: 'Invalid or non-HTTPS URL',
        });
        continue;
      }

      // Check size via HEAD request
      const fileSize = await this.getContentLength(entry.url, 'whatsapp');

      if (fileSize !== null) {
        if (fileSize > limits.maxPerFile) {
          this.metricsService.incrementMediaFailure(
            'whatsapp',
            'file_too_large',
          );
          this.logger.warn(
            `WhatsApp media ${entry.url} exceeds ${limits.maxPerFile} bytes limit`,
          );
          results.push({
            type: entry.type,
            filename: entry.filename,
            mimeType: entry.mimeType,
            url: entry.url,
            context: entry.context,
            error: `File size ${fileSize} exceeds limit ${limits.maxPerFile}`,
          });
          continue;
        }
        totalSize += fileSize;
      }

      // Pass URL through
      results.push({
        type: entry.type,
        filename: entry.filename,
        mimeType: entry.mimeType,
        url: entry.url,
        context: entry.context,
      });
    }

    return results;
  }

  private async processPush(
    mediaArray: MediaEntry[],
  ): Promise<ProcessedMedia[]> {
    const limits = this.channelLimits.push;

    // Find first inline image
    const inlineImage = mediaArray.find(
      (entry) => entry.context === 'inline' && entry.type === 'image',
    );

    if (!inlineImage) {
      return [];
    }

    // Validate URL
    if (!this.isValidHttpsUrl(inlineImage.url)) {
      this.metricsService.incrementMediaFailure('push', 'invalid_url');
      return [
        {
          type: inlineImage.type,
          filename: inlineImage.filename,
          mimeType: inlineImage.mimeType,
          url: inlineImage.url,
          context: inlineImage.context,
          error: 'Invalid or non-HTTPS URL',
        },
      ];
    }

    // Check size via HEAD request
    const fileSize = await this.getContentLength(inlineImage.url, 'push');

    if (fileSize !== null && fileSize > limits.maxPerFile) {
      this.metricsService.incrementMediaFailure('push', 'file_too_large');
      this.logger.warn(
        `Push notification image ${inlineImage.url} exceeds ${limits.maxPerFile} bytes limit`,
      );
      return [
        {
          type: inlineImage.type,
          filename: inlineImage.filename,
          mimeType: inlineImage.mimeType,
          url: inlineImage.url,
          context: inlineImage.context,
          error: `File size ${fileSize} exceeds limit ${limits.maxPerFile}`,
        },
      ];
    }

    // Pass URL through
    return [
      {
        type: inlineImage.type,
        filename: inlineImage.filename,
        mimeType: inlineImage.mimeType,
        url: inlineImage.url,
        context: inlineImage.context,
      },
    ];
  }

  private async downloadAndEncode(
    entry: MediaEntry,
    channel: string,
  ): Promise<ProcessedMedia> {
    // Validate URL
    if (!this.isValidHttpsUrl(entry.url)) {
      this.metricsService.incrementMediaFailure(channel, 'invalid_url');
      return {
        type: entry.type,
        filename: entry.filename,
        mimeType: entry.mimeType,
        context: entry.context,
        error: 'Invalid or non-HTTPS URL',
      };
    }

    const startTime = Date.now();
    try {
      const response = await firstValueFrom(
        this.httpService.get(entry.url, {
          responseType: 'arraybuffer',
          timeout: this.downloadTimeoutMs,
        }),
      );

      const durationMs = Date.now() - startTime;
      this.metricsService.observeMediaDownloadDuration(channel, durationMs);

      const contentType =
        response.headers['content-type'] ??
        entry.mimeType ??
        'application/octet-stream';
      const buffer = Buffer.from(response.data);
      const base64 = buffer.toString('base64');

      return {
        type: entry.type,
        filename: entry.filename ?? this.extractFilename(entry.url),
        mimeType: contentType,
        content: base64,
        context: entry.context,
      };
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      this.metricsService.observeMediaDownloadDuration(channel, durationMs);

      const reason =
        error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT'
          ? 'timeout'
          : 'download_error';
      this.metricsService.incrementMediaFailure(channel, reason);
      this.logger.warn(
        `Failed to download media ${entry.url}: ${error.message}`,
      );

      return {
        type: entry.type,
        filename: entry.filename,
        mimeType: entry.mimeType,
        context: entry.context,
        error: `Download failed: ${error.message}`,
      };
    }
  }

  private async getContentLength(
    url: string,
    channel: string,
  ): Promise<number | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.head(url, { timeout: this.downloadTimeoutMs }),
      );
      const contentLength = response.headers['content-length'];
      return contentLength ? parseInt(contentLength, 10) : null;
    } catch (error: any) {
      this.logger.warn(`Failed HEAD request for ${url}: ${error.message}`);
      return null;
    }
  }

  private isValidHttpsUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private extractFilename(url: string): string {
    try {
      const pathname = new URL(url).pathname;
      const segments = pathname.split('/');
      return segments[segments.length - 1] || 'attachment';
    } catch {
      return 'attachment';
    }
  }
}
