import {
  Controller,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { RenderingService } from './services/rendering.service.js';
import { RenderTemplateDto, PreviewTemplateDto } from './dto/index.js';

@Controller('templates')
export class RenderingController {
  constructor(private readonly renderingService: RenderingService) {}

  @Post(':id/render')
  render(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenderTemplateDto,
  ) {
    return this.renderingService.render(id, dto);
  }

  @Post(':id/preview')
  preview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PreviewTemplateDto,
  ) {
    return this.renderingService.preview(id, dto);
  }
}
