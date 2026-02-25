export interface NormalizedEventMessage {
  eventId: string;
  correlationId: string;
  sourceId: string;
  cycleId: string;
  eventType: string;
  priority: string;
  normalizedPayload: Record<string, any>;
  publishedAt: string;
}
