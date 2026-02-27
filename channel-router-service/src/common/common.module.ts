import { Global, Module } from '@nestjs/common';
import { LoggingInterceptor } from './interceptors/logging.interceptor.js';

@Global()
@Module({
  providers: [LoggingInterceptor],
  exports: [LoggingInterceptor],
})
export class CommonModule {}
