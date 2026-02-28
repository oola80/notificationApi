import { DlqController } from './dlq.controller';

describe('DlqController', () => {
  let controller: DlqController;
  let mockService: any;

  beforeEach(() => {
    mockService = {
      findAll: jest.fn().mockResolvedValue({ data: [], meta: {} }),
      updateStatus: jest.fn().mockResolvedValue({ data: {} }),
      reprocess: jest.fn().mockResolvedValue({ data: {} }),
    };
    controller = new DlqController(mockService);
  });

  it('should delegate findAll to service', async () => {
    const query = { status: 'pending' };
    await controller.findAll(query as any);
    expect(mockService.findAll).toHaveBeenCalledWith(query);
  });

  it('should delegate updateStatus to service', async () => {
    const dto = { status: 'investigated' };
    await controller.updateStatus('d-1', dto as any);
    expect(mockService.updateStatus).toHaveBeenCalledWith('d-1', dto);
  });

  it('should delegate reprocess to service', async () => {
    const body = { resolvedBy: 'admin' };
    await controller.reprocess('d-1', body);
    expect(mockService.reprocess).toHaveBeenCalledWith('d-1', 'admin');
  });

  it('should handle reprocess with no body', async () => {
    await controller.reprocess('d-1', {} as any);
    expect(mockService.reprocess).toHaveBeenCalledWith('d-1', undefined);
  });
});
