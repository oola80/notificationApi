// Exchanges
export const EXCHANGE_EVENTS_NORMALIZED = 'xch.events.normalized';
export const EXCHANGE_NOTIFICATIONS_DELIVER = 'xch.notifications.deliver';
export const EXCHANGE_NOTIFICATIONS_STATUS = 'xch.notifications.status';
export const EXCHANGE_NOTIFICATIONS_DLQ = 'xch.notifications.dlq';
export const EXCHANGE_CONFIG_EVENTS = 'xch.config.events';

// Queues
export const QUEUE_ENGINE_EVENTS_CRITICAL = 'q.engine.events.critical';
export const QUEUE_ENGINE_EVENTS_NORMAL = 'q.engine.events.normal';
export const QUEUE_CONFIG_RULE_CACHE = 'q.config.rule-cache';
export const QUEUE_CONFIG_OVERRIDE_CACHE = 'q.config.override-cache';
export const QUEUE_ENGINE_STATUS_INBOUND = 'q.engine.status.inbound';

// Routing key builders
export function deliverRoutingKey(priority: string, channel: string): string {
  return `notification.deliver.${priority}.${channel}`;
}

export function statusRoutingKey(status: string): string {
  return `notification.status.${status}`;
}

export function parseNormalizedRoutingKey(routingKey: string): {
  priority: string;
  eventType: string;
} | null {
  const parts = routingKey.split('.');
  if (parts.length < 3 || parts[0] !== 'event') {
    return null;
  }
  return {
    priority: parts[1],
    eventType: parts.slice(2).join('.'),
  };
}
