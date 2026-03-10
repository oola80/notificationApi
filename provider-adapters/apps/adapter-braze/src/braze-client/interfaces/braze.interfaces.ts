export interface BrazeEmailMessage {
  app_id: string;
  subject: string;
  body: string;
  from: string;
  attachments?: BrazeAttachment[];
  extras?: Record<string, string>;
}

export interface BrazeAttachment {
  file_name: string;
  url: string;
}

export interface BrazeSmsMessage {
  app_id: string;
  subscription_group_id: string;
  body: string;
  media_items?: BrazeSmsMediaItem[];
}

export interface BrazeSmsMediaItem {
  url: string;
  content_type: string;
}

export interface BrazeWhatsAppMessage {
  app_id: string;
  subscription_group_id: string;
  message_type: string;
  message: BrazeWhatsAppMessageBody;
}

export interface BrazeWhatsAppMessageBody {
  template_name?: string;
  template_language_code?: string;
  variables?: BrazeWhatsAppVariable[];
  header?: BrazeWhatsAppHeader;
  body?: string;
}

export interface BrazeWhatsAppVariable {
  key: string;
  value: string;
}

export interface BrazeWhatsAppHeader {
  type: string;
  url: string;
}

export interface BrazeApplePushMessage {
  app_id: string;
  alert: {
    title: string;
    body: string;
  };
  mutable_content?: boolean;
  media_url?: string;
}

export interface BrazeAndroidPushMessage {
  app_id: string;
  title: string;
  alert: string;
  image_url?: string;
}

export interface BrazeSendPayload {
  external_user_ids: string[];
  messages: {
    email?: BrazeEmailMessage;
    sms?: BrazeSmsMessage;
    whatsapp?: BrazeWhatsAppMessage;
    apple_push?: BrazeApplePushMessage;
    android_push?: BrazeAndroidPushMessage;
  };
}

export interface BrazeSendResponse {
  dispatch_id: string;
  errors: BrazeError[];
  message: string;
}

export interface BrazeError {
  type: string;
  message: string;
}

export interface BrazeUserAttribute {
  external_id: string;
  email?: string;
  phone?: string;
}

export interface BrazeTrackPayload {
  attributes: BrazeUserAttribute[];
}

export interface BrazeTrackResponse {
  message: string;
  errors?: BrazeError[];
  attributes_processed?: number;
}
