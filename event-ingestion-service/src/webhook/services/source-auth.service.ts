import { Injectable } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { EventSourcesRepository } from '../../event-sources/event-sources.repository.js';
import { EventSource } from '../../event-sources/entities/event-source.entity.js';
import { createErrorResponse } from '../../common/errors.js';

@Injectable()
export class SourceAuthService {
  constructor(
    private readonly eventSourcesRepository: EventSourcesRepository,
  ) {}

  async authenticateSource(
    sourceId: string,
    headers: Record<string, string | string[] | undefined>,
    rawBody?: string,
  ): Promise<EventSource> {
    const source = await this.eventSourcesRepository.findByName(sourceId);
    if (!source) {
      throw createErrorResponse('EIS-003');
    }

    if (!source.isActive) {
      throw createErrorResponse('EIS-008');
    }

    // Try API Key auth
    const apiKey = this.extractHeader(headers, 'x-api-key');
    if (apiKey && source.apiKeyHash) {
      const hash = createHash('sha256').update(apiKey).digest('hex');
      if (this.safeCompare(hash, source.apiKeyHash)) {
        return source;
      }
    }

    // Try Bearer token auth
    const authHeader = this.extractHeader(headers, 'authorization');
    if (authHeader && source.apiKeyHash) {
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      if (match) {
        const hash = createHash('sha256').update(match[1]).digest('hex');
        if (this.safeCompare(hash, source.apiKeyHash)) {
          return source;
        }
      }
    }

    // Try HMAC signature auth
    const signature = this.extractHeader(headers, 'x-signature');
    if (signature && source.signingSecretHash && rawBody) {
      const computed = createHmac('sha256', source.signingSecretHash)
        .update(rawBody)
        .digest('hex');
      if (this.safeCompare(computed, signature)) {
        return source;
      }
    }

    throw createErrorResponse('EIS-013');
  }

  private extractHeader(
    headers: Record<string, string | string[] | undefined>,
    name: string,
  ): string | undefined {
    const value = headers[name] ?? headers[name.toLowerCase()];
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  }

  private safeCompare(a: string, b: string): boolean {
    try {
      const bufA = Buffer.from(a, 'utf8');
      const bufB = Buffer.from(b, 'utf8');
      if (bufA.length !== bufB.length) {
        return false;
      }
      return timingSafeEqual(bufA, bufB);
    } catch {
      return false;
    }
  }
}
