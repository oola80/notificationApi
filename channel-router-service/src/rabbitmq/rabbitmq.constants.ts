// Exchanges
export const EXCHANGE_NOTIFICATIONS_STATUS = 'xch.notifications.status';
export const EXCHANGE_NOTIFICATIONS_DELIVER = 'xch.notifications.deliver';
export const EXCHANGE_NOTIFICATIONS_DLQ = 'xch.notifications.dlq';

// Queues — 8 priority-tiered delivery queues (4 channels x 2 priorities)
export const QUEUE_DELIVER_EMAIL_CRITICAL = 'q.deliver.email.critical';
export const QUEUE_DELIVER_EMAIL_NORMAL = 'q.deliver.email.normal';
export const QUEUE_DELIVER_SMS_CRITICAL = 'q.deliver.sms.critical';
export const QUEUE_DELIVER_SMS_NORMAL = 'q.deliver.sms.normal';
export const QUEUE_DELIVER_WHATSAPP_CRITICAL = 'q.deliver.whatsapp.critical';
export const QUEUE_DELIVER_WHATSAPP_NORMAL = 'q.deliver.whatsapp.normal';
export const QUEUE_DELIVER_PUSH_CRITICAL = 'q.deliver.push.critical';
export const QUEUE_DELIVER_PUSH_NORMAL = 'q.deliver.push.normal';

// Routing key builders
export function deliverRoutingKey(priority: string, channel: string): string {
  return `notification.deliver.${priority}.${channel}`;
}

export function statusRoutingKey(status: string): string {
  return `notification.status.${status}`;
}

export function deliveryAttemptRoutingKey(outcome: string): string {
  return `channel-router.delivery-attempt.${outcome}`;
}
