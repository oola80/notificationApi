/**
 * Braze transactional postback payload.
 * Arrives as individual JSON events at POST /webhooks/inbound.
 */
export interface BrazePostbackPayload {
  event_type: string;
  dispatch_id?: string;
  message_id?: string;
  external_user_id?: string;
  email_address?: string;
  phone_number?: string;
  device_id?: string;
  timestamp?: string;
  send_id?: string;
  campaign_id?: string;
  canvas_step_id?: string;
  key_value_pairs?: Record<string, string>;
  message_extras?: Record<string, string>;
}

/**
 * Braze Currents event payload.
 * Arrives as batched arrays of events.
 */
export interface BrazeCurrentsPayload {
  events: BrazeCurrentsEvent[];
}

export interface BrazeCurrentsEvent {
  event_type: string;
  dispatch_id?: string;
  message_id?: string;
  external_user_id?: string;
  email_address?: string;
  phone_number?: string;
  device_id?: string;
  timestamp?: number;
  send_id?: string;
  campaign_id?: string;
  canvas_step_id?: string;
  properties?: Record<string, any>;
}

/**
 * Union type for incoming Braze webhook payloads.
 * The controller inspects the shape to determine if it's
 * a single postback or a Currents batch.
 */
export type BrazeWebhookPayload = BrazePostbackPayload | BrazeCurrentsPayload;
