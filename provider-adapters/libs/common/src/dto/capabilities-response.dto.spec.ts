import { AdapterCapabilitiesResponseDto } from './capabilities-response.dto.js';

describe('AdapterCapabilitiesResponseDto', () => {
  it('should create a valid capabilities response', () => {
    const dto = new AdapterCapabilitiesResponseDto();
    dto.providerId = 'mailgun';
    dto.providerName = 'Mailgun';
    dto.supportedChannels = ['email'];
    dto.supportsAttachments = true;
    dto.supportsMediaUrls = false;
    dto.maxAttachmentSizeMb = 25;
    dto.maxRecipientsPerRequest = 1000;
    dto.webhookPath = '/webhooks/inbound';

    expect(dto.providerId).toBe('mailgun');
    expect(dto.supportsAttachments).toBe(true);
    expect(dto.maxAttachmentSizeMb).toBe(25);
  });
});
