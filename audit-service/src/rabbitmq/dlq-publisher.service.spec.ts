import { DlqPublisher } from './dlq-publisher.service';

describe('DlqPublisher', () => {
  let publisher: DlqPublisher;
  let mockAmqpConnection: any;

  beforeEach(() => {
    mockAmqpConnection = {
      publish: jest.fn().mockResolvedValue(undefined),
    };
    publisher = new DlqPublisher(mockAmqpConnection);
  });

  it('should publish message to specified exchange and routing key', async () => {
    const payload = { test: 'data' };
    await publisher.republish('xch.events.normalized', 'event.normalized', payload);

    expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
      'xch.events.normalized',
      'event.normalized',
      payload,
    );
  });

  it('should use empty string for falsy routing key', async () => {
    await publisher.republish('xch.events.normalized', '', { data: true });

    expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
      'xch.events.normalized',
      '',
      { data: true },
    );
  });

  it('should propagate publish errors', async () => {
    mockAmqpConnection.publish.mockRejectedValue(new Error('Connection lost'));
    await expect(
      publisher.republish('xch.test', 'key', {}),
    ).rejects.toThrow('Connection lost');
  });
});
