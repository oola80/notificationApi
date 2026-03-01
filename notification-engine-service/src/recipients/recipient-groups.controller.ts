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
import { RecipientGroupsService } from './recipient-groups.service.js';
import {
  CreateRecipientGroupDto,
  UpdateRecipientGroupDto,
  ListRecipientGroupsQueryDto,
  RecipientGroupMemberDto,
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

  @Get(':id')
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findById(id);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRecipientGroupDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.service.softDelete(id);
  }

  @Get(':id/members')
  findMembers(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findMembers(id);
  }

  @Post(':id/members')
  @HttpCode(HttpStatus.CREATED)
  addMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecipientGroupMemberDto,
  ) {
    return this.service.addMember(id, dto);
  }

  @Delete(':id/members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId') memberId: number,
  ) {
    await this.service.removeMember(id, memberId);
  }
}
