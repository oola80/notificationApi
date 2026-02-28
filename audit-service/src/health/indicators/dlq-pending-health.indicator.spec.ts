import { DlqPendingHealthIndicator } from './dlq-pending-health.indicator';

describe('DlqPendingHealthIndicator', () => {
  let indicator: DlqPendingHealthIndicator;
  let mockDlqRepo: any;

  beforeEach(() => {
    mockDlqRepo = {
      countPending: jest.fn(),
    };
    indicator = new DlqPendingHealthIndicator(mockDlqRepo);
  });

  it('should be defined', () => {
    expect(indicator).toBeDefined();
  });

  it('should return ok with pending count', async () => {
    mockDlqRepo.countPending.mockResolvedValue(8);

    const result = await indicator.check();
    expect(result.status).toBe('ok');
    expect(result.pending).toBe(8);
  });

  it('should return ok with zero pending', async () => {
    mockDlqRepo.countPending.mockResolvedValue(0);

    const result = await indicator.check();
    expect(result.status).toBe('ok');
    expect(result.pending).toBe(0);
  });

  it('should return error when database query fails', async () => {
    mockDlqRepo.countPending.mockRejectedValue(new Error('DB error'));

    const result = await indicator.check();
    expect(result.status).toBe('error');
    expect(result.pending).toBe(-1);
  });
});
