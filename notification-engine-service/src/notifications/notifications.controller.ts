import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { ListNotificationsQueryDto, ManualSendDto } from './dto/index.js';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  findAll(@Query() query: ListNotificationsQueryDto) {
    return this.notificationsService.findAll(query);
  }

  @Get(':id')
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.notificationsService.findById(id);
  }

  @Get(':id/timeline')
  getTimeline(@Param('id', ParseUUIDPipe) id: string) {
    return this.notificationsService.getTimeline(id);
  }

  @Post('send')
  @HttpCode(HttpStatus.CREATED)
  manualSend(@Body() dto: ManualSendDto) {
    return this.notificationsService.manualSend(dto);
  }
}
