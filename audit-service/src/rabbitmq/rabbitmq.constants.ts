// Exchanges (consumed, not published to)
export const EXCHANGE_EVENTS_NORMALIZED = 'xch.events.normalized';
export const EXCHANGE_NOTIFICATIONS_DELIVER = 'xch.notifications.deliver';
export const EXCHANGE_NOTIFICATIONS_STATUS = 'xch.notifications.status';
export const EXCHANGE_NOTIFICATIONS_DLQ = 'xch.notifications.dlq';

// Queues
export const QUEUE_AUDIT_EVENTS = 'audit.events';
export const QUEUE_AUDIT_DELIVER = 'audit.deliver';
export const QUEUE_STATUS_UPDATES = 'q.status.updates';
export const QUEUE_AUDIT_TEMPLATE = 'q.audit.template';
export const QUEUE_AUDIT_DLQ = 'audit.dlq';

// Named channels (for per-queue prefetch control)
export const CHANNEL_EVENTS = 'channel-events';
export const CHANNEL_DELIVER = 'channel-deliver';
export const CHANNEL_STATUS = 'channel-status';
export const CHANNEL_TEMPLATE = 'channel-template';
export const CHANNEL_DLQ = 'channel-dlq';

// All consumed queues for health/metrics reference
export const ALL_CONSUMED_QUEUES = [
  QUEUE_AUDIT_EVENTS,
  QUEUE_AUDIT_DELIVER,
  QUEUE_STATUS_UPDATES,
  QUEUE_AUDIT_TEMPLATE,
  QUEUE_AUDIT_DLQ,
] as const;

// Routing key helpers
export function extractProviderFromWebhookKey(routingKey: string): string {
  // adapter.webhook.{providerId} → adapter-{providerId}
  const segments = routingKey.split('.');
  if (segments.length >= 3 && segments[0] === 'adapter' && segments[1] === 'webhook') {
    return `adapter-${segments[2]}`;
  }
  return 'unknown-adapter';
}

export function isWebhookRoutingKey(routingKey: string): boolean {
  return routingKey.startsWith('adapter.webhook.');
}
