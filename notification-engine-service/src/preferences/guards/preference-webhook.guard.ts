import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createErrorResponse } from '../../common/errors.js';

@Injectable()
export class PreferenceWebhookGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'] as string | undefined;
    const expectedKey = this.config.get<string>('app.preferenceWebhookApiKey');

    if (!apiKey || apiKey !== expectedKey) {
      throw createErrorResponse('NES-013');
    }

    return true;
  }
}
