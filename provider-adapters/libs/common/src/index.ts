// DTOs
export {
  SendRequestDto,
  RecipientDto,
  ContentDto,
  MediaDto,
  MetadataDto,
  ChannelType,
} from './dto/send-request.dto.js';
export { SendResultDto } from './dto/send-result.dto.js';
export {
  WebhookEventDto,
  WebhookEventType,
} from './dto/webhook-event.dto.js';
export { AdapterHealthResponseDto } from './dto/health-response.dto.js';
export { AdapterCapabilitiesResponseDto } from './dto/capabilities-response.dto.js';

// Errors
export { ErrorResponse } from './errors/error-response.interface.js';
export {
  ErrorDefinition,
  BASE_ERROR_CODES,
  createErrorResponse,
} from './errors/base-errors.js';
export { HttpExceptionFilter } from './errors/http-exception.filter.js';

// Pipes
export { DtoValidationPipe } from './pipes/dto-validation.pipe.js';

// Interceptors
export { LoggingInterceptor } from './interceptors/logging.interceptor.js';

// Metrics
export { MetricsModule } from './metrics/metrics.module.js';
export { MetricsService } from './metrics/metrics.service.js';
export { MetricsController } from './metrics/metrics.controller.js';

// RabbitMQ
export { AppRabbitMQModule } from './rabbitmq/rabbitmq.module.js';
export { RabbitMQPublisherService } from './rabbitmq/rabbitmq-publisher.service.js';
export {
  EXCHANGE_NOTIFICATIONS_STATUS,
  webhookRoutingKey,
} from './rabbitmq/rabbitmq.constants.js';

// Health
export { BaseHealthService } from './health/base-health.service.js';
