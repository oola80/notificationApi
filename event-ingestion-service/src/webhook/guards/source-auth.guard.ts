import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { SourceAuthService } from '../services/source-auth.service.js';

@Injectable()
export class SourceAuthGuard implements CanActivate {
  constructor(private readonly sourceAuthService: SourceAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const sourceId = request.body?.sourceId;

    if (!sourceId) {
      return false;
    }

    const eventSource = await this.sourceAuthService.authenticateSource(
      sourceId,
      request.headers as Record<string, string | string[] | undefined>,
      typeof request.body === 'string'
        ? request.body
        : JSON.stringify(request.body),
    );

    (request as any)['eventSource'] = eventSource;
    return true;
  }
}
