import { SendResultDto } from './send-result.dto.js';

describe('SendResultDto', () => {
  it('should create a success result', () => {
    const dto = new SendResultDto();
    dto.success = true;
    dto.providerMessageId = 'msg-123';
    dto.retryable = false;
    dto.errorMessage = null;
    dto.httpStatus = 200;
    dto.providerResponse = { id: 'msg-123' };

    expect(dto.success).toBe(true);
    expect(dto.providerMessageId).toBe('msg-123');
    expect(dto.retryable).toBe(false);
  });

  it('should create a failure result', () => {
    const dto = new SendResultDto();
    dto.success = false;
    dto.providerMessageId = null;
    dto.retryable = true;
    dto.errorMessage = 'Service unavailable';
    dto.httpStatus = 503;
    dto.providerResponse = null;

    expect(dto.success).toBe(false);
    expect(dto.retryable).toBe(true);
  });
});
