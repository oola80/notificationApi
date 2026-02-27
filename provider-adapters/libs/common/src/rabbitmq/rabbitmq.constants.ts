export const EXCHANGE_NOTIFICATIONS_STATUS = 'xch.notifications.status';

export function webhookRoutingKey(providerId: string): string {
  return `adapter.webhook.${providerId}`;
}
