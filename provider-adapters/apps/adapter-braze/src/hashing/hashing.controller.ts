import { Controller, Post, Body } from '@nestjs/common';
import { HashingService } from './hashing.service.js';
import {
  HashEmailRequestDto,
  HashEmailResponseDto,
} from './dto/hash-email.dto.js';

@Controller('v1/customers')
export class HashingController {
  constructor(private readonly hashingService: HashingService) {}

  @Post('hash-email')
  hashEmail(@Body() dto: HashEmailRequestDto): HashEmailResponseDto {
    const normalizedEmail = this.hashingService.normalizeEmail(dto.email);
    const emailHash = this.hashingService.hashEmail(dto.email);

    return {
      emailHash,
      algo: 'SHA-256',
      algoVersion: 'v1',
      normalizedEmail,
    };
  }
}
