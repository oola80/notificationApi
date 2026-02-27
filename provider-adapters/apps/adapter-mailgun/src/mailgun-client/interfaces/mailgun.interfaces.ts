export interface MailgunApiResponse {
  id: string;
  message: string;
}

export interface MailgunSendOptions {
  from: string;
  to: string;
  subject?: string;
  text?: string;
  html?: string;
  headers?: Record<string, string>;
  customVariables?: Record<string, string>;
  attachments?: MailgunAttachment[];
}

export interface MailgunAttachment {
  filename: string;
  contentType: string;
  data: Buffer;
}
