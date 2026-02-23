/**
 * Inbound message shape — received from xch.events.incoming queues.
 */
export interface RabbitMqEventMessage {
  eventId?: string;
  correlationId?: string;
  sourceId: string;
  cycleId: string;
  eventType: string;
  sourceEventId?: string;
  timestamp?: string;
  payload: Record<string, any>;
}

/**
 * Outbound message shape — published to xch.events.normalized.
 */
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
