export type SnsMessageType =
  | 'SubscriptionConfirmation'
  | 'Notification'
  | 'UnsubscribeConfirmation';

export interface SnsMessage {
  Type: SnsMessageType;
  MessageId: string;
  TopicArn: string;
  Subject?: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: '1' | '2';
  Signature: string;
  SigningCertURL: string;
  SubscribeURL?: string;
  UnsubscribeURL?: string;
  Token?: string;
}

export type SesEventType =
  | 'Send'
  | 'Delivery'
  | 'Bounce'
  | 'Complaint'
  | 'Reject'
  | 'Open'
  | 'Click';

export interface SesMailHeader {
  name: string;
  value: string;
}

export interface SesMail {
  messageId: string;
  timestamp: string;
  source: string;
  sourceArn?: string;
  sendingAccountId?: string;
  destination: string[];
  headersTruncated?: boolean;
  headers?: SesMailHeader[];
  commonHeaders?: {
    from?: string[];
    to?: string[];
    subject?: string;
    returnPath?: string;
    messageId?: string;
  };
  tags?: Record<string, string[]>;
}

export interface SesBouncedRecipient {
  emailAddress: string;
  action?: string;
  status?: string;
  diagnosticCode?: string;
}

export interface SesBounce {
  bounceType: 'Permanent' | 'Transient' | 'Undetermined';
  bounceSubType: string;
  bouncedRecipients: SesBouncedRecipient[];
  timestamp: string;
  feedbackId: string;
  reportingMTA?: string;
  remoteMtaIp?: string;
}

export interface SesComplainedRecipient {
  emailAddress: string;
}

export interface SesComplaint {
  complainedRecipients: SesComplainedRecipient[];
  timestamp: string;
  feedbackId: string;
  complaintSubType?: string;
  complaintFeedbackType?: string;
  userAgent?: string;
  arrivalDate?: string;
}

export interface SesDelivery {
  timestamp: string;
  processingTimeMillis: number;
  recipients: string[];
  smtpResponse: string;
  reportingMTA: string;
  remoteMtaIp?: string;
}

export interface SesReject {
  reason: string;
}

export interface SesOpen {
  timestamp: string;
  userAgent: string;
  ipAddress: string;
}

export interface SesClick {
  timestamp: string;
  ipAddress: string;
  userAgent: string;
  link: string;
  linkTags?: Record<string, string[]>;
}

export interface SesSend {
  // Send event has no additional fields beyond mail
}

export interface SesNotification {
  eventType: SesEventType;
  mail: SesMail;
  send?: SesSend;
  bounce?: SesBounce;
  complaint?: SesComplaint;
  delivery?: SesDelivery;
  reject?: SesReject;
  open?: SesOpen;
  click?: SesClick;
}
