import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

export interface DedupKeyResult {
  hash: string;
  resolvedValues: Record<string, string>;
}

@Injectable()
export class DedupKeyResolverService {
  resolve(
    dedupKeyFields: string[],
    eventPayload: Record<string, any>,
    recipient: { email?: string; phone?: string; name?: string },
  ): DedupKeyResult {
    const resolvedValues: Record<string, string> = {};

    for (const field of dedupKeyFields) {
      const value = this.resolveField(field, eventPayload, recipient);
      resolvedValues[field] = value ?? '';
    }

    const concatenated = dedupKeyFields
      .map((field) => resolvedValues[field])
      .join('|');

    const hash = createHash('sha256').update(concatenated).digest('hex');

    return { hash, resolvedValues };
  }

  private resolveField(
    field: string,
    eventPayload: Record<string, any>,
    recipient: { email?: string; phone?: string; name?: string },
  ): string | undefined {
    if (field.startsWith('recipient.')) {
      const recipientField = field.substring('recipient.'.length);
      return String(recipient[recipientField as keyof typeof recipient] ?? '');
    }

    if (field === 'eventType') {
      return String(eventPayload['eventType'] ?? '');
    }

    return String(eventPayload[field] ?? '');
  }
}
