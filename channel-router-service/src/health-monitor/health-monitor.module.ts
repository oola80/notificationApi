import { Module } from '@nestjs/common';
import { AdapterClientModule } from '../adapter-client/adapter-client.module.js';
import { ProvidersModule } from '../providers/providers.module.js';
import { CircuitBreakerModule } from '../circuit-breaker/circuit-breaker.module.js';
import { AdapterHealthMonitorService } from './adapter-health-monitor.service.js';

@Module({
  imports: [AdapterClientModule, ProvidersModule, CircuitBreakerModule],
  providers: [AdapterHealthMonitorService],
  exports: [AdapterHealthMonitorService],
})
export class HealthMonitorModule {}
