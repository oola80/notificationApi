import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CircuitBreakerService } from './circuit-breaker.service.js';
import { ProviderConfig } from '../providers/entities/provider-config.entity.js';
import { ProviderConfigsRepository } from '../providers/provider-configs.repository.js';

@Module({
  imports: [TypeOrmModule.forFeature([ProviderConfig])],
  providers: [CircuitBreakerService, ProviderConfigsRepository],
  exports: [CircuitBreakerService],
})
export class CircuitBreakerModule {}
