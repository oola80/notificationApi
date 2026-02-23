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
import { EventMappingsService } from './event-mappings.service.js';
import { CreateEventMappingDto } from './dto/create-event-mapping.dto.js';
import { UpdateEventMappingDto } from './dto/update-event-mapping.dto.js';
import { ListEventMappingsQueryDto } from './dto/list-event-mappings-query.dto.js';
import { TestMappingDto } from './dto/test-mapping.dto.js';

@Controller('api/v1/event-mappings')
export class EventMappingsController {
  constructor(private readonly eventMappingsService: EventMappingsService) {}

  @Get()
  findAll(@Query() query: ListEventMappingsQueryDto) {
    return this.eventMappingsService.findAll(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateEventMappingDto) {
    return this.eventMappingsService.create(dto);
  }

  @Get(':id')
  findById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.eventMappingsService.findById(id);
  }

  @Put(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateEventMappingDto,
  ) {
    return this.eventMappingsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.eventMappingsService.softDelete(id);
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  testMapping(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: TestMappingDto,
  ) {
    return this.eventMappingsService.testMapping(id, dto);
  }
}
