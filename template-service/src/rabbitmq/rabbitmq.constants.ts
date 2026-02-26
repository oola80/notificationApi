// Exchange
export const EXCHANGE_NOTIFICATIONS_STATUS = 'xch.notifications.status';

// Routing key builders
export function templateRoutingKey(action: string): string {
  return `template.template.${action}`;
}

export function renderRoutingKey(status: string): string {
  return `template.render.${status}`;
}
