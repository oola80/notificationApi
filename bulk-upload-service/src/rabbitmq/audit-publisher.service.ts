import { Injectable, Logger } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { v4 as uuidv4 } from 'uuid';
import { MetricsService } from '../metrics/metrics.service.js';
import {
  EXCHANGE_NOTIFICATIONS_STATUS,
  ROUTING_KEY_UPLOAD_CREATED,
  ROUTING_KEY_UPLOAD_PROCESSING,
  ROUTING_KEY_UPLOAD_PROGRESS,
  ROUTING_KEY_UPLOAD_COMPLETED,
  ROUTING_KEY_UPLOAD_CANCELLED,
  ROUTING_KEY_UPLOAD_RETRIED,
} from './rabbitmq.constants.js';

export interface AuditUploadData {
  uploadId: string;
  fileName: string;
  uploadedBy: string;
  status: string;
  totalRows: number;
  processedRows: number;
  succeededRows: number;
  failedRows: number;
  progressPercent?: number;
  completedAt?: string;
  resultFilePath?: string | null;
}

@Injectable()
export class AuditPublisherService {
  private readonly logger = new Logger(AuditPublisherService.name);

  constructor(
    private readonly amqpConnection: AmqpConnection,
    private readonly metricsService: MetricsService,
  ) {}

  publishUploadCreated(data: AuditUploadData): void {
    this.publish(ROUTING_KEY_UPLOAD_CREATED, data);
  }

  publishUploadProcessing(data: AuditUploadData): void {
    this.publish(ROUTING_KEY_UPLOAD_PROCESSING, data);
  }

  publishUploadProgress(data: AuditUploadData): void {
    this.publish(ROUTING_KEY_UPLOAD_PROGRESS, data);
  }

  publishUploadCompleted(data: AuditUploadData): void {
    this.publish(ROUTING_KEY_UPLOAD_COMPLETED, data);
  }

  publishUploadCancelled(data: AuditUploadData): void {
    this.publish(ROUTING_KEY_UPLOAD_CANCELLED, data);
  }

  publishUploadRetried(data: AuditUploadData): void {
    this.publish(ROUTING_KEY_UPLOAD_RETRIED, data);
  }

  private publish(routingKey: string, data: AuditUploadData): void {
    const startTime = Date.now();
    const message = {
      eventId: uuidv4(),
      source: 'bulk-upload-service',
      type: routingKey,
      timestamp: new Date().toISOString(),
      data,
    };

    try {
      void this.amqpConnection.publish(
        EXCHANGE_NOTIFICATIONS_STATUS,
        routingKey,
        message,
        {
          persistent: true,
          contentType: 'application/json',
        },
      );

      const durationSeconds = (Date.now() - startTime) / 1000;
      this.metricsService.incrementRabbitMQPublish(routingKey, 'success');
      this.metricsService.observeRabbitMQPublishDuration(durationSeconds);

      this.logger.debug(
        `Published ${routingKey} for upload=${data.uploadId}`,
      );
    } catch (error: any) {
      const durationSeconds = (Date.now() - startTime) / 1000;
      this.metricsService.incrementRabbitMQPublish(routingKey, 'failure');
      this.metricsService.observeRabbitMQPublishDuration(durationSeconds);

      this.logger.warn(
        `Failed to publish ${routingKey} for upload=${data.uploadId}: ${error.message}`,
      );
    }
  }
}
