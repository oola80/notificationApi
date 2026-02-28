import { AuditLogsController } from './audit-logs.controller';
import { AuditLogsService } from './audit-logs.service';

describe('AuditLogsController', () => {
  let controller: AuditLogsController;
  let mockService: any;

  beforeEach(() => {
    mockService = {
      findAll: jest.fn().mockResolvedValue({
        data: [],
        meta: { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 },
      }),
    };

    controller = new AuditLogsController(
      mockService as unknown as AuditLogsService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /audit/logs', () => {
    it('should delegate to service.findAll', async () => {
      const query = { page: 1, pageSize: 50 };
      await controller.findAll(query);

      expect(mockService.findAll).toHaveBeenCalledWith(query);
    });

    it('should return the service response', async () => {
      const expected = {
        data: [{ id: '1' }],
        meta: { page: 1, pageSize: 50, totalCount: 1, totalPages: 1 },
      };
      mockService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll({ page: 1, pageSize: 50 });

      expect(result).toBe(expected);
    });
  });
});
