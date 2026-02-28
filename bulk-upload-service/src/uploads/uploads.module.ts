import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UploadsController } from './uploads.controller.js';
import { UploadsService } from './uploads.service.js';
import { UploadsRepository } from './uploads.repository.js';
import { UploadRowsRepository } from './upload-rows.repository.js';
import { Upload } from './entities/upload.entity.js';
import { UploadRow } from './entities/upload-row.entity.js';
import { AppRabbitMQModule } from '../rabbitmq/rabbitmq.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([Upload, UploadRow]), AppRabbitMQModule],
  controllers: [UploadsController],
  providers: [UploadsService, UploadsRepository, UploadRowsRepository],
  exports: [UploadsService, UploadsRepository, UploadRowsRepository],
})
export class UploadsModule {}
