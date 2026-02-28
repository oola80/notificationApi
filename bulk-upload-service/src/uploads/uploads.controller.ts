import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  Res,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import type { Response } from 'express';
import { UploadsService } from './uploads.service.js';
import { QueryUploadsDto } from './dto/query-uploads.dto.js';
import { ErrorRowsQueryDto } from './dto/error-rows-query.dto.js';
import { createErrorResponse } from '../common/errors.js';
import { UploadStatus } from './entities/upload.entity.js';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const tempDir = process.env.UPLOAD_TEMP_DIR ?? './uploads/temp';
          const fs = require('fs');
          fs.mkdirSync(tempDir, { recursive: true });
          cb(null, tempDir);
        },
        filename: (_req, file, cb) => {
          const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
          cb(null, uniqueName);
        },
      }),
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    // uploadedBy would come from JWT in production — use placeholder for Phase 1
    const uploadedBy = '00000000-0000-0000-0000-000000000000';
    return this.uploadsService.processUpload(file, uploadedBy);
  }

  @Get()
  async listUploads(@Query() query: QueryUploadsDto) {
    return this.uploadsService.findAll(query);
  }

  @Get(':id')
  async getUpload(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.uploadsService.findById(id);
  }

  @Get(':id/status')
  async getUploadStatus(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.uploadsService.getStatus(id);
  }

  @Get(':id/result')
  async downloadResult(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const upload = await this.uploadsService.findById(id);

    if (
      upload.status === UploadStatus.QUEUED ||
      upload.status === UploadStatus.PROCESSING
    ) {
      throw createErrorResponse('BUS-015');
    }

    if (!upload.resultFilePath || !fs.existsSync(upload.resultFilePath)) {
      throw createErrorResponse('BUS-002', 'Result file not available');
    }

    const originalName = path.basename(
      upload.fileName,
      path.extname(upload.fileName),
    );

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${originalName}_result.xlsx"`,
    });

    const fileStream = fs.createReadStream(upload.resultFilePath);
    return new StreamableFile(fileStream);
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  async retryUpload(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.uploadsService.retryUpload(id);
  }

  @Get(':id/errors')
  async getUploadErrors(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: ErrorRowsQueryDto,
  ) {
    return this.uploadsService.getErrors(id, query);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancelOrDelete(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.uploadsService.cancelOrDelete(id);
  }
}
