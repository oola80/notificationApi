import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  createTestApp,
  createMockDeliveryReceiptsRepository,
} from './test-utils';
import { AuditReceiptsController } from '../src/receipts/audit-receipts.controller';
import { AuditReceiptsService } from '../src/receipts/audit-receipts.service';
import { DeliveryReceiptsRepository } from '../src/receipts/delivery-receipts.repository';

describe('Receipts E2E', () => {
  let app: INestApplication<App>;
  let mockRepo: ReturnType<typeof createMockDeliveryReceiptsRepository>;

  beforeAll(async () => {
    mockRepo = createMockDeliveryReceiptsRepository();

    app = await createTestApp({
      controllers: [AuditReceiptsController],
      providers: [
        AuditReceiptsService,
        { provide: DeliveryReceiptsRepository, useValue: mockRepo },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return receipts for a notification', async () => {
    mockRepo.findByNotificationId.mockResolvedValue([
      {
        id: 'rc-1',
        notificationId: 'n-1',
        channel: 'email',
        provider: 'mailgun',
        status: 'delivered',
        providerMessageId: 'pm-1',
        rawResponse: null,
        receivedAt: new Date('2026-01-01T10:05:00Z'),
      },
    ]);

    const { body } = await request(app.getHttpServer())
      .get('/audit/receipts/n-1')
      .expect(200);

    expect(body.notificationId).toBe('n-1');
    expect(body.receipts).toHaveLength(1);
    expect(body.receipts[0].channel).toBe('email');
    expect(body.receipts[0].provider).toBe('mailgun');
  });

  it('should return 404 (AUD-008) when no receipts found', async () => {
    mockRepo.findByNotificationId.mockResolvedValue([]);

    const { body } = await request(app.getHttpServer())
      .get('/audit/receipts/nonexistent')
      .expect(404);

    expect(body.code).toBe('AUD-008');
  });

  it('should return multiple receipts', async () => {
    mockRepo.findByNotificationId.mockResolvedValue([
      {
        id: 'rc-1',
        channel: 'email',
        provider: 'mailgun',
        status: 'sent',
      },
      {
        id: 'rc-2',
        channel: 'email',
        provider: 'mailgun',
        status: 'delivered',
      },
    ]);

    const { body } = await request(app.getHttpServer())
      .get('/audit/receipts/n-1')
      .expect(200);

    expect(body.receipts).toHaveLength(2);
  });

  it('should return correct response shape', async () => {
    mockRepo.findByNotificationId.mockResolvedValue([
      {
        id: 'rc-1',
        channel: 'email',
        provider: 'mailgun',
        status: 'delivered',
      },
    ]);

    const { body } = await request(app.getHttpServer())
      .get('/audit/receipts/n-1')
      .expect(200);

    expect(body).toHaveProperty('notificationId');
    expect(body).toHaveProperty('receipts');
    expect(Array.isArray(body.receipts)).toBe(true);
  });
});
