import { DeliveryReceipt } from './delivery-receipt.entity';

describe('DeliveryReceipt Entity', () => {
  it('should create an instance with all properties', () => {
    const receipt = new DeliveryReceipt();
    receipt.id = '661f9500-f30c-52e5-b827-557766550111';
    receipt.notificationId = 'notif-456';
    receipt.correlationId = 'corr-abc-123';
    receipt.cycleId = 'CYC-2026-00451';
    receipt.channel = 'email';
    receipt.provider = 'mailgun';
    receipt.status = 'DELIVERED';
    receipt.providerMessageId = '<20230101.abc123@domain.com>';
    receipt.rawResponse = { event: 'delivered' };
    receipt.receivedAt = new Date();

    expect(receipt.channel).toBe('email');
    expect(receipt.provider).toBe('mailgun');
    expect(receipt.status).toBe('DELIVERED');
    expect(receipt.providerMessageId).toBe('<20230101.abc123@domain.com>');
  });

  it('should allow nullable fields to be null', () => {
    const receipt = new DeliveryReceipt();
    receipt.channel = 'sms';
    receipt.provider = 'braze';
    receipt.status = 'BOUNCED';

    expect(receipt.notificationId).toBeUndefined();
    expect(receipt.providerMessageId).toBeUndefined();
    expect(receipt.rawResponse).toBeUndefined();
  });
});
