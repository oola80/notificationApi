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
import { CriticalChannelOverridesService } from './critical-channel-overrides.service.js';
import {
  CreateOverrideDto,
  UpdateOverrideDto,
  ListOverridesQueryDto,
} from './dto/index.js';

@Controller('critical-channel-overrides')
export class CriticalChannelOverridesController {
  constructor(private readonly service: CriticalChannelOverridesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateOverrideDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(@Query() query: ListOverridesQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findById(id);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOverrideDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.softDelete(id);
  }
}
