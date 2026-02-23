import { Injectable } from '@nestjs/common';

@Injectable()
export class EventTypeResolverService {
  resolve(
    rawEventType: string,
    eventTypeMapping: Record<string, string> | null | undefined,
  ): string {
    if (!eventTypeMapping) {
      return rawEventType;
    }

    // Exact match
    if (rawEventType in eventTypeMapping) {
      return eventTypeMapping[rawEventType];
    }

    // Wildcard fallback
    if ('*' in eventTypeMapping) {
      return eventTypeMapping['*'];
    }

    // No match — return raw type unchanged
    return rawEventType;
  }
}
