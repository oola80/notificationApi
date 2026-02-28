import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

const MIN_FREE_BYTES = 100 * 1024 * 1024; // 100 MB

@Injectable()
export class DiskSpaceHealthIndicator {
  private readonly logger = new Logger(DiskSpaceHealthIndicator.name);

  constructor(private readonly configService: ConfigService) {}

  async check(): Promise<{ status: string; free: string }> {
    try {
      const tempDir = this.configService.get<string>(
        'app.uploadTempDir',
        './uploads/temp',
      );
      const resultDir = this.configService.get<string>(
        'app.uploadResultDir',
        './uploads/results',
      );

      // Ensure directories exist for the check
      const checkDir = this.resolveCheckDir(tempDir, resultDir);
      const stats = fs.statfsSync(checkDir);

      const freeBytes = stats.bavail * stats.bsize;
      const freeFormatted = this.formatBytes(freeBytes);

      return {
        status: freeBytes >= MIN_FREE_BYTES ? 'up' : 'down',
        free: freeFormatted,
      };
    } catch (error: any) {
      this.logger.warn(`Disk space check failed: ${error.message}`);
      return { status: 'down', free: 'unknown' };
    }
  }

  private resolveCheckDir(tempDir: string, resultDir: string): string {
    // Try the temp dir first, fall back to result dir, then cwd
    for (const dir of [tempDir, resultDir]) {
      const resolved = path.resolve(dir);
      if (fs.existsSync(resolved)) {
        return resolved;
      }
    }
    return process.cwd();
  }

  private formatBytes(bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
}
