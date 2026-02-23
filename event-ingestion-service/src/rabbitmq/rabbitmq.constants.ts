// Exchange names
export const EXCHANGE_EVENTS_INCOMING = 'xch.events.incoming';
export const EXCHANGE_EVENTS_NORMALIZED = 'xch.events.normalized';
export const EXCHANGE_NOTIFICATIONS_DLQ = 'xch.notifications.dlq';
export const EXCHANGE_CONFIG_EVENTS = 'xch.config.events';

// Queue names
export const QUEUE_EVENTS_AMQP = 'q.events.amqp';
export const QUEUE_EVENTS_WEBHOOK = 'q.events.webhook';
export const QUEUE_EVENTS_EMAIL_INGEST = 'q.events.email-ingest';
export const QUEUE_CONFIG_MAPPING_CACHE = 'q.config.mapping-cache';

/**
 * Build a routing key for xch.events.incoming.
 * Format: source.{sourceId}.{eventType}
 */
export function incomingRoutingKey(
  sourceId: string,
  eventType: string,
): string {
  return `source.${sourceId}.${eventType}`;
}

/**
 * Build a routing key for xch.events.normalized.
 * Format: event.{priority}.{eventType}
 */
export function normalizedRoutingKey(
  priority: string,
  eventType: string,
): string {
  return `event.${priority}.${eventType}`;
}

/**
 * Parse an incoming routing key into its components.
 * Input: source.{sourceId}.{eventType} (eventType may contain dots)
 * Returns: { sourceId, eventType }
 * Throws on invalid format.
 */
export function parseIncomingRoutingKey(routingKey: string): {
  sourceId: string;
  eventType: string;
} {
  const segments = routingKey.split('.');
  if (segments.length < 3 || segments[0] !== 'source') {
    throw new Error(
      `Invalid incoming routing key format: "${routingKey}". Expected "source.{sourceId}.{eventType}"`,
    );
  }

  const sourceId = segments[1];
  const eventType = segments.slice(2).join('.');

  return { sourceId, eventType };
}
