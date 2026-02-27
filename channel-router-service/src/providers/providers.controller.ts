import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ProvidersService } from './providers.service.js';
import { RegisterProviderDto } from './dto/register-provider.dto.js';
import { UpdateProviderConfigDto } from './dto/update-provider-config.dto.js';

@Controller('providers')
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterProviderDto) {
    return this.providersService.register(dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deregister(@Param('id', ParseUUIDPipe) id: string) {
    return this.providersService.deregister(id);
  }

  @Get()
  findAll() {
    return this.providersService.findAll();
  }

  @Put(':id/config')
  updateConfig(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProviderConfigDto,
  ) {
    return this.providersService.updateConfig(id, dto);
  }

  @Get(':id/capabilities')
  getCapabilities(@Param('id', ParseUUIDPipe) id: string) {
    return this.providersService.getCapabilities(id);
  }

  @Get(':id/health')
  getHealth(@Param('id', ParseUUIDPipe) id: string) {
    return this.providersService.getHealth(id);
  }
}
