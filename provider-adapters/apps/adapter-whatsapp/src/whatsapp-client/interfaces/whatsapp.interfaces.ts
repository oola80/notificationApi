export interface WhatsAppTextMessage {
  messaging_product: 'whatsapp';
  to: string;
  type: 'text';
  text: {
    body: string;
  };
}

export interface WhatsAppTemplateMessage {
  messaging_product: 'whatsapp';
  to: string;
  type: 'template';
  template: {
    name: string;
    language: {
      code: string;
    };
    components?: WhatsAppTemplateComponent[];
  };
}

export interface WhatsAppTemplateComponent {
  type: 'body' | 'header' | 'button';
  parameters: WhatsAppTemplateParameter[];
}

export interface WhatsAppTemplateParameter {
  type: 'text' | 'image' | 'document' | 'video';
  parameter_name?: string;
  text?: string;
  image?: { link: string };
  document?: { link: string; filename?: string };
  video?: { link: string };
}

export interface WhatsAppMediaMessage {
  messaging_product: 'whatsapp';
  to: string;
  type: 'image' | 'document' | 'video';
  image?: {
    link: string;
    caption?: string;
  };
  document?: {
    link: string;
    caption?: string;
    filename?: string;
  };
  video?: {
    link: string;
    caption?: string;
  };
}

export type WhatsAppMessage =
  | WhatsAppTextMessage
  | WhatsAppTemplateMessage
  | WhatsAppMediaMessage;

export interface WhatsAppApiContact {
  input: string;
  wa_id: string;
}

export interface WhatsAppApiMessageId {
  id: string;
}

export interface WhatsAppApiResponse {
  messaging_product: string;
  contacts: WhatsAppApiContact[];
  messages: WhatsAppApiMessageId[];
}

export interface WhatsAppApiError {
  message: string;
  type: string;
  code: number;
  error_subcode?: number;
  fbtrace_id: string;
}

export interface WhatsAppApiErrorResponse {
  error: WhatsAppApiError;
}
