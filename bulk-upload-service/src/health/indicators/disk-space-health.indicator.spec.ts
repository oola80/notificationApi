import * as fs from 'fs';
import { DiskSpaceHealthIndicator } from './disk-space-health.indicator.js';

jest.mock('fs');

describe('DiskSpaceHealthIndicator', () => {
  let indicator: DiskSpaceHealthIndicator;
  let mockConfigService: any;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          'app.uploadTempDir': './uploads/temp',
          'app.uploadResultDir': './uploads/results',
        };
        return config[key] ?? defaultValue;
      }),
    };
    indicator = new DiskSpaceHealthIndicator(mockConfigService);
  });

  it('should be defined', () => {
    expect(indicator).toBeDefined();
  });

  it('should return up when disk has sufficient free space', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.statfsSync as jest.Mock).mockReturnValue({
      bavail: 500000,
      bsize: 4096,
    });

    const result = await indicator.check();
    expect(result.status).toBe('up');
    expect(result.free).toMatch(/GB|MB/);
  });

  it('should return down when disk is low on space', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.statfsSync as jest.Mock).mockReturnValue({
      bavail: 10,
      bsize: 4096,
    });

    const result = await indicator.check();
    expect(result.status).toBe('down');
  });

  it('should return down when statfs throws', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.statfsSync as jest.Mock).mockImplementation(() => {
      throw new Error('Permission denied');
    });

    const result = await indicator.check();
    expect(result.status).toBe('down');
    expect(result.free).toBe('unknown');
  });

  it('should check temp dir first if it exists', async () => {
    (fs.existsSync as jest.Mock).mockImplementation((p: string) =>
      p.includes('temp'),
    );
    (fs.statfsSync as jest.Mock).mockReturnValue({
      bavail: 500000,
      bsize: 4096,
    });

    const result = await indicator.check();
    expect(result.status).toBe('up');
  });
});
