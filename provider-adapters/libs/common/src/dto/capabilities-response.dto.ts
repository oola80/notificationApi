export class AdapterCapabilitiesResponseDto {
  providerId: string;
  providerName: string;
  supportedChannels: string[];
  supportsAttachments: boolean;
  supportsMediaUrls: boolean;
  maxAttachmentSizeMb: number;
  maxRecipientsPerRequest: number;
  webhookPath: string;
}
