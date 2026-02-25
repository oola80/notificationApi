import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { TemplateClientService } from './template-client.service.js';
import { CircuitBreakerService } from './circuit-breaker.service.js';

@Module({
  imports: [
    HttpModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        baseURL: config.get<string>('app.templateServiceUrl'),
        timeout: 5000,
      }),
    }),
  ],
  providers: [TemplateClientService, CircuitBreakerService],
  exports: [TemplateClientService, CircuitBreakerService],
})
export class TemplateClientModule {}
