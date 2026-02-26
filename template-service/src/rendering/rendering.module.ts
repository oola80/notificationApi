import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Template } from '../templates/entities/template.entity.js';
import { TemplateVersion } from '../templates/entities/template-version.entity.js';
import { TemplateChannel } from '../templates/entities/template-channel.entity.js';
import { TemplateVariable } from '../templates/entities/template-variable.entity.js';
import { AppRabbitMQModule } from '../rabbitmq/rabbitmq.module.js';
import { RenderingController } from './rendering.controller.js';
import { RenderingService } from './services/rendering.service.js';
import { TemplateCacheService } from './services/template-cache.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Template,
      TemplateVersion,
      TemplateChannel,
      TemplateVariable,
    ]),
    AppRabbitMQModule,
  ],
  controllers: [RenderingController],
  providers: [RenderingService, TemplateCacheService],
  exports: [TemplateCacheService],
})
export class RenderingModule {}
