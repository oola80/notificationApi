import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

@Injectable()
export class HashingService {
  private cachedPepper: string | null = null;
  private pepperCachedAt = 0;
  private readonly pepperCacheTtlMs: number;

  constructor(private readonly configService: ConfigService) {
    const ttlSeconds = this.configService.get<number>(
      'braze.pepperCacheTtl',
      86400,
    );
    this.pepperCacheTtlMs = ttlSeconds * 1000;
  }

  hashEmail(email: string): string {
    const normalized = this.normalizeEmail(email);
    const pepper = this.getPepper();
    return createHash('sha256')
      .update(pepper + normalized)
      .digest('hex');
  }

  normalizeEmail(email: string): string {
    return email.trim().normalize('NFKC').toLowerCase();
  }

  private getPepper(): string {
    const now = Date.now();
    if (
      this.cachedPepper !== null &&
      now - this.pepperCachedAt < this.pepperCacheTtlMs
    ) {
      return this.cachedPepper;
    }

    this.cachedPepper = this.configService.get<string>(
      'braze.emailHashPepper',
      '',
    );
    this.pepperCachedAt = now;
    return this.cachedPepper;
  }
}
