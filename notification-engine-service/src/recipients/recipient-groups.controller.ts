import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { RecipientGroupsService } from './recipient-groups.service.js';
import {
  CreateRecipientGroupDto,
  UpdateRecipientGroupDto,
  ListRecipientGroupsQueryDto,
} from './dto/index.js';

@Controller('recipient-groups')
export class RecipientGroupsController {
  constructor(private readonly service: RecipientGroupsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateRecipientGroupDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(@Query() query: ListRecipientGroupsQueryDto) {
    return this.service.findAll(query);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRecipientGroupDto,
  ) {
    return this.service.update(id, dto);
  }
}
