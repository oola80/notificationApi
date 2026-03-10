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

  it('should delegate to SendService and return result', async () => {
    const expectedResult = {
      success: true,
      providerMessageId: 'dispatch-123',
      retryable: false,
      errorMessage: null,
      httpStatus: 200,
      providerResponse: { dispatch_id: 'dispatch-123' },
    };
    mockSendService.send.mockResolvedValue(expectedResult);

    const request = {
      channel: ChannelType.EMAIL,
      recipient: { address: 'user@example.com' },
      content: { subject: 'Test', body: 'Hello' },
      metadata: { notificationId: 'notif-123' },
    } as any;

    const result = await controller.send(request);

    expect(result).toEqual(expectedResult);
    expect(mockSendService.send).toHaveBeenCalledWith(request);
  });

  it('should catch unexpected errors and return failure', async () => {
    mockSendService.send.mockRejectedValue(new Error('Unexpected crash'));

    const request = {
      channel: ChannelType.EMAIL,
      recipient: { address: 'user@example.com' },
      content: { subject: 'Test', body: 'Hello' },
      metadata: { notificationId: 'notif-123' },
    } as any;

    const result = await controller.send(request);

    expect(result.success).toBe(false);
    expect(result.httpStatus).toBe(500);
    expect(result.errorMessage).toBe('Unexpected crash');
    expect(result.retryable).toBe(false);
  });
});
