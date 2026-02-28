import { Module } from '@nestjs/common';
import { ProcessingService } from './processing.service.js';
import { ParsingModule } from '../parsing/parsing.module.js';
import { EventIngestionModule } from '../event-ingestion/event-ingestion.module.js';
import { ResultsModule } from '../results/results.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { CircuitBreakerModule } from '../circuit-breaker/circuit-breaker.module.js';
import { RateLimiterModule } from '../rate-limiter/rate-limiter.module.js';
import { AppRabbitMQModule } from '../rabbitmq/rabbitmq.module.js';

@Module({
  imports: [
    ParsingModule,
    EventIngestionModule,
    ResultsModule,
    UploadsModule,
    CircuitBreakerModule,
    RateLimiterModule,
    AppRabbitMQModule,
  ],
  providers: [ProcessingService],
  exports: [ProcessingService],
})
export class ProcessingModule {}
