import { SendController } from './send.controller.js';
import { ChannelType } from '@app/common';

describe('SendController', () => {
  let controller: SendController;
  let mockSendService: any;

  beforeEach(() => {
    mockSendService = {
      send: jest.fn(),
    };
    controller = new SendController(mockSendService);
  });

  function makeRequest(overrides: any = {}) {
    return {
      channel: ChannelType.EMAIL,
      recipient: { address: 'user@example.com' },
      content: {
        subject: 'Test Subject',
        body: '<p>Hello</p>',
      },
      metadata: {
        notificationId: 'notif-123',
      },
      ...overrides,
    };
  }

  describe('POST /send', () => {
    it('should delegate to send service and return result', async () => {
      const expectedResult = {
        success: true,
        providerMessageId: '<msg@distelsa.info>',
        retryable: false,
        errorMessage: null,
        httpStatus: 200,
        providerResponse: { id: '<msg@distelsa.info>', message: 'Queued.' },
      };

      mockSendService.send.mockResolvedValue(expectedResult);

      const result = await controller.send(makeRequest());

      expect(result).toEqual(expectedResult);
      expect(mockSendService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: ChannelType.EMAIL,
          recipient: { address: 'user@example.com' },
        }),
      );
    });

    it('should return success=false result from service', async () => {
      const errorResult = {
        success: false,
        providerMessageId: null,
        retryable: true,
        errorMessage: 'Mailgun rate limit exceeded',
        httpStatus: 429,
        providerResponse: null,
      };

      mockSendService.send.mockResolvedValue(errorResult);

      const result = await controller.send(makeRequest());

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(true);
    });

    it('should catch unexpected errors and return failure result', async () => {
      mockSendService.send.mockRejectedValue(
        new Error('Unexpected crash'),
      );

      const result = await controller.send(makeRequest());

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(false);
      expect(result.errorMessage).toBe('Unexpected crash');
      expect(result.httpStatus).toBe(500);
      expect(result.providerMessageId).toBeNull();
    });
  });
});
