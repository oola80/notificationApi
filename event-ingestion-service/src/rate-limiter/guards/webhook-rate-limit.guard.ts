import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import type { Response } from 'express';
import { RateLimiterService } from '../rate-limiter.service.js';
import { createErrorResponse } from '../../common/errors.js';

@Injectable()
export class WebhookRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimiterService: RateLimiterService) {}

  canActivate(context: ExecutionContext): boolean {
    const allowed = this.rateLimiterService.checkGlobalWebhookLimit();

    if (!allowed) {
      const response = context.switchToHttp().getResponse<Response>();
      response.setHeader('Retry-After', '1');
      throw createErrorResponse('EIS-017');
    }

    return true;
  }
}
