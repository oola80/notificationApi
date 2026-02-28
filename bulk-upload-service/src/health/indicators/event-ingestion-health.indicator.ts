import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EventIngestionHealthIndicator {
  private readonly logger = new Logger(EventIngestionHealthIndicator.name);

  constructor(private readonly configService: ConfigService) {}

  async check(): Promise<{ status: string; latencyMs: number }> {
    const start = Date.now();
    try {
      const baseUrl = this.configService.get<string>(
        'app.eventIngestionUrl',
        'http://localhost:3151',
      );

      const response = await fetch(`${baseUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });

      return {
        status: response.ok ? 'up' : 'down',
        latencyMs: Date.now() - start,
      };
    } catch {
      return { status: 'down', latencyMs: Date.now() - start };
    }
  }
}
