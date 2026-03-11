export interface SesSendOptions {
  to: string;
  from: string;
  subject?: string;
  html?: string;
  text?: string;
  attachments?: SesAttachment[];
  replyTo?: string;
  headers?: Record<string, string>;
}

export interface SesAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

export interface SesSmtpResponse {
  messageId: string;
  envelope: {
    from: string;
    to: string[];
  };
}

export interface SesApiResponse {
  messageId: string;
}

export interface SesAccountInfo {
  maxSendRate: number;
  max24HourSend: number;
  sentLast24Hours: number;
  sendingEnabled: boolean;
}

export interface SesSendResult {
  messageId: string;
}

export interface SesClientInterface {
  sendEmail(options: SesSendOptions): Promise<SesSendResult>;
  checkConnectivity(): Promise<{
    ok: boolean;
    latencyMs: number;
    details: Record<string, any>;
  }>;
}

export const SES_CLIENT = Symbol('SES_CLIENT');
