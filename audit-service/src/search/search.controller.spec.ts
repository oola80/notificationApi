import { SearchController } from './search.controller';
import { SearchService } from './search.service';

describe('SearchController', () => {
  let controller: SearchController;
  let mockService: any;

  beforeEach(() => {
    mockService = {
      search: jest.fn().mockResolvedValue({
        data: [],
        meta: { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 },
      }),
    };

    controller = new SearchController(
      mockService as unknown as SearchService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /audit/search', () => {
    it('should delegate to service.search', async () => {
      const query = { q: 'test', page: 1, pageSize: 50 };
      await controller.search(query);

      expect(mockService.search).toHaveBeenCalledWith(query);
    });

    it('should return the service response', async () => {
      const expected = {
        data: [{ id: '1' }],
        meta: { page: 1, pageSize: 50, totalCount: 1, totalPages: 1 },
      };
      mockService.search.mockResolvedValue(expected);

      const result = await controller.search({
        q: 'test',
        page: 1,
        pageSize: 50,
      });

      expect(result).toBe(expected);
    });
  });
});
