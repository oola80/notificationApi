import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeliveryAttempt } from './entities/delivery-attempt.entity.js';
import { DeliveryAttemptsRepository } from './delivery-attempts.repository.js';
import { DeliveryPipelineService } from './delivery-pipeline.service.js';
import { ProvidersModule } from '../providers/providers.module.js';
import { ChannelsModule } from '../channels/channels.module.js';
import { CircuitBreakerModule } from '../circuit-breaker/circuit-breaker.module.js';
import { RateLimiterModule } from '../rate-limiter/rate-limiter.module.js';
import { RetryModule } from '../retry/retry.module.js';
import { MediaModule } from '../media/media.module.js';
import { AdapterClientModule } from '../adapter-client/adapter-client.module.js';
import { FallbackModule } from '../fallback/fallback.module.js';
import { AppRabbitMQModule } from '../rabbitmq/rabbitmq.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([DeliveryAttempt]),
    ProvidersModule,
    ChannelsModule,
    CircuitBreakerModule,
    RateLimiterModule,
    RetryModule,
    MediaModule,
    AdapterClientModule,
    FallbackModule,
    forwardRef(() => AppRabbitMQModule),
  ],
  providers: [DeliveryAttemptsRepository, DeliveryPipelineService],
  exports: [DeliveryAttemptsRepository, DeliveryPipelineService],
})
export class DeliveryModule {}
