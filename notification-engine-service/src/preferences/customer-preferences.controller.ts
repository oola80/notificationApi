import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { CustomerPreferencesService } from './customer-preferences.service.js';
import { UpsertPreferenceDto, BulkUpsertPreferencesDto } from './dto/index.js';
import { PreferenceWebhookGuard } from './guards/preference-webhook.guard.js';

@Controller('customer-preferences')
export class CustomerPreferencesController {
  constructor(private readonly service: CustomerPreferencesService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(PreferenceWebhookGuard)
  upsert(@Body() dto: UpsertPreferenceDto) {
    return this.service.upsert(dto);
  }

  @Post('bulk')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PreferenceWebhookGuard)
  bulkUpsert(@Body() dto: BulkUpsertPreferencesDto) {
    return this.service.bulkUpsert(dto);
  }
}
