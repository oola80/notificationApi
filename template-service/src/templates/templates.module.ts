import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TemplatesController } from './templates.controller.js';
import { TemplatesService } from './services/templates.service.js';
import { VariableDetectorService } from './services/variable-detector.service.js';
import { TemplatesRepository } from './repositories/templates.repository.js';
import { TemplateVersionsRepository } from './repositories/template-versions.repository.js';
import { TemplateChannelsRepository } from './repositories/template-channels.repository.js';
import { TemplateVariablesRepository } from './repositories/template-variables.repository.js';
import { Template } from './entities/template.entity.js';
import { TemplateVersion } from './entities/template-version.entity.js';
import { TemplateChannel } from './entities/template-channel.entity.js';
import { TemplateVariable } from './entities/template-variable.entity.js';
import { RenderingModule } from '../rendering/rendering.module.js';
import { AppRabbitMQModule } from '../rabbitmq/rabbitmq.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Template,
      TemplateVersion,
      TemplateChannel,
      TemplateVariable,
    ]),
    RenderingModule,
    AppRabbitMQModule,
  ],
  controllers: [TemplatesController],
  providers: [
    TemplatesService,
    VariableDetectorService,
    TemplatesRepository,
    TemplateVersionsRepository,
    TemplateChannelsRepository,
    TemplateVariablesRepository,
  ],
  exports: [TemplatesService],
})
export class TemplatesModule {}
