import { Module } from '@nestjs/common';
import { MappingEngineService } from './mapping-engine.service.js';
import { EventTypeResolverService } from './event-type-resolver.service.js';
import { PayloadValidatorService } from './payload-validator.service.js';

@Module({
  providers: [
    MappingEngineService,
    EventTypeResolverService,
    PayloadValidatorService,
  ],
  exports: [
    MappingEngineService,
    EventTypeResolverService,
    PayloadValidatorService,
  ],
})
export class NormalizationModule {}
