import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ChannelsService } from './channels.service.js';
import { UpdateChannelConfigDto } from './dto/update-channel-config.dto.js';

@Controller('channels')
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get()
  findAll() {
    return this.channelsService.findAll();
  }

  @Put(':id/config')
  updateConfig(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateChannelConfigDto,
  ) {
    return this.channelsService.updateConfig(id, dto);
  }
}
