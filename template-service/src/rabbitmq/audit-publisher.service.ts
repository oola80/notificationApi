import { Injectable, Logger, Optional } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import {
  EXCHANGE_NOTIFICATIONS_STATUS,
  templateRoutingKey,
  renderRoutingKey,
} from './rabbitmq.constants.js';
import { MetricsService } from '../metrics/metrics.service.js';

interface AuditMessage {
  eventType: string;
  timestamp: string;
  service: string;
  correlationId?: string;
  data: Record<string, any>;
}

@Injectable()
export class AuditPublisherService {
  private readonly logger = new Logger(AuditPublisherService.name);

  constructor(
    private readonly amqpConnection: AmqpConnection,
    @Optional() private readonly metricsService?: MetricsService,
  ) {}

  publishTemplateCreated(
    template: { id: string; slug: string; name: string },
    correlationId?: string,
  ): void {
    this.publish(templateRoutingKey('created'), {
      eventType: 'template.template.created',
      timestamp: new Date().toISOString(),
      service: 'template-service',
      correlationId,
      data: {
        templateId: template.id,
        slug: template.slug,
        name: template.name,
      },
    });
  }

  publishTemplateUpdated(
    template: { id: string; slug: string },
    versionNumber: number,
    correlationId?: string,
  ): void {
    this.publish(templateRoutingKey('updated'), {
      eventType: 'template.template.updated',
      timestamp: new Date().toISOString(),
      service: 'template-service',
      correlationId,
      data: {
        templateId: template.id,
        slug: template.slug,
        versionNumber,
      },
    });
  }

  publishTemplateDeleted(
    templateId: string,
    correlationId?: string,
  ): void {
    this.publish(templateRoutingKey('deleted'), {
      eventType: 'template.template.deleted',
      timestamp: new Date().toISOString(),
      service: 'template-service',
      correlationId,
      data: { templateId },
    });
  }

  publishTemplateRolledback(
    template: { id: string; slug: string },
    fromVersion: number,
    toVersion: number,
    correlationId?: string,
  ): void {
    this.publish(templateRoutingKey('rolledback'), {
      eventType: 'template.template.rolledback',
      timestamp: new Date().toISOString(),
      service: 'template-service',
      correlationId,
      data: {
        templateId: template.id,
        slug: template.slug,
        fromVersion,
        toVersion,
      },
    });
  }

  publishRenderCompleted(
    templateId: string,
    channel: string,
    versionNumber: number,
    durationMs: number,
    correlationId?: string,
  ): void {
    this.publish(renderRoutingKey('completed'), {
      eventType: 'template.render.completed',
      timestamp: new Date().toISOString(),
      service: 'template-service',
      correlationId,
      data: { templateId, channel, versionNumber, durationMs },
    });
  }

  publishRenderFailed(
    templateId: string,
    channel: string,
    error: string,
    correlationId?: string,
  ): void {
    this.publish(renderRoutingKey('failed'), {
      eventType: 'template.render.failed',
      timestamp: new Date().toISOString(),
      service: 'template-service',
      correlationId,
      data: { templateId, channel, error },
    });
  }

  private publish(routingKey: string, message: AuditMessage): void {
    try {
      this.amqpConnection.publish(
        EXCHANGE_NOTIFICATIONS_STATUS,
        routingKey,
        message,
        {
          persistent: true,
          contentType: 'application/json',
          headers: {
            'x-service': 'template-service',
            'x-event-type': message.eventType,
            ...(message.correlationId && {
              'x-correlation-id': message.correlationId,
            }),
          },
        },
      );
      this.logger.debug(`Published audit event: ${message.eventType}`);
    } catch (error) {
      this.metricsService?.incrementAuditPublishFailure();
      this.logger.warn(
        `Failed to publish audit event ${message.eventType}: ${(error as Error).message}`,
      );
    }
  }
}
