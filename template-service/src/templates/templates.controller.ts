import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { TemplatesService } from './services/templates.service.js';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  ListTemplatesQueryDto,
  RollbackTemplateDto,
} from './dto/index.js';

@Controller('templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateTemplateDto) {
    return this.templatesService.create(dto);
  }

  @Get()
  findAll(@Query() query: ListTemplatesQueryDto) {
    return this.templatesService.findAll(query);
  }

  @Get(':id')
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.templatesService.findById(id);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.templatesService.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.templatesService.delete(id);
  }

  @Post(':id/rollback')
  rollback(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RollbackTemplateDto,
  ) {
    return this.templatesService.rollback(id, dto);
  }
}
