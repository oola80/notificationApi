import { ConfigService } from '@nestjs/config';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ParsingService } from './parsing.service.js';

describe('ParsingService', () => {
  let service: ParsingService;
  let configService: jest.Mocked<ConfigService>;
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parsing-test-'));
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    configService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          'app.groupItemsPrefix': 'item.',
          'app.groupKeyColumn': 'orderId',
        };
        return config[key] ?? defaultValue;
      }),
    } as any;

    service = new ParsingService(configService);
  });

  async function createTestXlsx(
    headers: string[],
    rows: any[][],
  ): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sheet1');
    sheet.addRow(headers);
    for (const row of rows) {
      sheet.addRow(row);
    }
    const filePath = path.join(tempDir, `test-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`);
    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  describe('parseHeaders', () => {
    it('should extract headers from first row', async () => {
      const filePath = await createTestXlsx(
        ['eventType', 'email', 'name'],
        [['order.created', 'test@example.com', 'Test']],
      );

      const headers = await service.parseHeaders(filePath);
      expect(headers).toEqual(['eventType', 'email', 'name']);
    });

    it('should return empty array for empty file', async () => {
      const workbook = new ExcelJS.Workbook();
      workbook.addWorksheet('Sheet1');
      const filePath = path.join(tempDir, `empty-${Date.now()}.xlsx`);
      await workbook.xlsx.writeFile(filePath);

      const headers = await service.parseHeaders(filePath);
      expect(headers).toEqual([]);
    });

    it('should skip null/undefined header values', async () => {
      const filePath = await createTestXlsx(
        ['eventType', 'data'],
        [['order.created', 'test']],
      );

      const headers = await service.parseHeaders(filePath);
      expect(headers).toContain('eventType');
      expect(headers).toContain('data');
    });
  });

  describe('parseRows', () => {
    it('should iterate over data rows', async () => {
      const filePath = await createTestXlsx(
        ['eventType', 'email'],
        [
          ['order.created', 'test@example.com'],
          ['order.shipped', 'test2@example.com'],
        ],
      );

      const rows: any[] = [];
      for await (const row of service.parseRows(filePath)) {
        rows.push(row);
      }

      expect(rows).toHaveLength(2);
      expect(rows[0].rowNumber).toBe(1);
      expect(rows[0].data.eventType).toBe('order.created');
      expect(rows[0].data.email).toBe('test@example.com');
      expect(rows[1].rowNumber).toBe(2);
    });

    it('should omit empty cells', async () => {
      const filePath = await createTestXlsx(
        ['eventType', 'email', 'name'],
        [['order.created', '', 'Test']],
      );

      const rows: any[] = [];
      for await (const row of service.parseRows(filePath)) {
        rows.push(row);
      }

      expect(rows).toHaveLength(1);
      expect(rows[0].data.email).toBeUndefined();
      expect(rows[0].data.name).toBe('Test');
    });

    it('should parse JSON strings in cells', async () => {
      const filePath = await createTestXlsx(
        ['eventType', 'items'],
        [['order.created', '[{"sku":"P1","qty":1}]']],
      );

      const rows: any[] = [];
      for await (const row of service.parseRows(filePath)) {
        rows.push(row);
      }

      expect(rows[0].data.items).toEqual([{ sku: 'P1', qty: 1 }]);
    });

    it('should parse JSON objects in cells', async () => {
      const filePath = await createTestXlsx(
        ['eventType', 'metadata'],
        [['order.created', '{"key":"value"}']],
      );

      const rows: any[] = [];
      for await (const row of service.parseRows(filePath)) {
        rows.push(row);
      }

      expect(rows[0].data.metadata).toEqual({ key: 'value' });
    });

    it('should preserve numeric values as numbers', async () => {
      const filePath = await createTestXlsx(
        ['eventType', 'amount'],
        [['order.created', 79.99]],
      );

      const rows: any[] = [];
      for await (const row of service.parseRows(filePath)) {
        rows.push(row);
      }

      expect(rows[0].data.amount).toBe(79.99);
      expect(typeof rows[0].data.amount).toBe('number');
    });

    it('should convert numeric strings to numbers', async () => {
      const filePath = await createTestXlsx(
        ['eventType', 'count'],
        [['order.created', '42']],
      );

      const rows: any[] = [];
      for await (const row of service.parseRows(filePath)) {
        rows.push(row);
      }

      expect(rows[0].data.count).toBe(42);
      expect(typeof rows[0].data.count).toBe('number');
    });

    it('should exclude reserved columns (prefixed with _)', async () => {
      const filePath = await createTestXlsx(
        ['eventType', '_internal', 'email'],
        [['order.created', 'hidden', 'test@example.com']],
      );

      const rows: any[] = [];
      for await (const row of service.parseRows(filePath)) {
        rows.push(row);
      }

      expect(rows[0].data._internal).toBeUndefined();
      expect(rows[0].data.email).toBe('test@example.com');
    });

    it('should extract eventType as a regular field in data', async () => {
      const filePath = await createTestXlsx(
        ['eventType', 'email'],
        [['order.created', 'test@example.com']],
      );

      const rows: any[] = [];
      for await (const row of service.parseRows(filePath)) {
        rows.push(row);
      }

      expect(rows[0].data.eventType).toBe('order.created');
    });

    it('should extract cycleId as a regular field in data', async () => {
      const filePath = await createTestXlsx(
        ['eventType', 'cycleId', 'email'],
        [['order.created', 'CYC-001', 'test@example.com']],
      );

      const rows: any[] = [];
      for await (const row of service.parseRows(filePath)) {
        rows.push(row);
      }

      expect(rows[0].data.cycleId).toBe('CYC-001');
    });

    it('should skip entirely empty rows', async () => {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Sheet1');
      sheet.addRow(['eventType', 'email']);
      sheet.addRow(['order.created', 'test@example.com']);
      sheet.addRow([null, null]); // empty row
      sheet.addRow(['order.shipped', 'test2@example.com']);
      const filePath = path.join(tempDir, `empty-row-${Date.now()}.xlsx`);
      await workbook.xlsx.writeFile(filePath);

      const rows: any[] = [];
      for await (const row of service.parseRows(filePath)) {
        rows.push(row);
      }

      expect(rows).toHaveLength(2);
    });

    it('should handle invalid JSON strings as plain strings', async () => {
      const filePath = await createTestXlsx(
        ['eventType', 'note'],
        [['order.created', '{not valid json']],
      );

      const rows: any[] = [];
      for await (const row of service.parseRows(filePath)) {
        rows.push(row);
      }

      expect(rows[0].data.note).toBe('{not valid json');
    });

    it('should handle boolean values', async () => {
      const filePath = await createTestXlsx(
        ['eventType', 'flag'],
        [['order.created', true]],
      );

      const rows: any[] = [];
      for await (const row of service.parseRows(filePath)) {
        rows.push(row);
      }

      expect(rows[0].data.flag).toBe(true);
    });

    it('should extract text from ExcelJS hyperlink objects', async () => {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Sheet1');
      sheet.addRow(['eventType', 'email']);
      const dataRow = sheet.addRow(['order.created', null]);
      // Set cell value as a hyperlink object (how ExcelJS represents mailto: links)
      dataRow.getCell(2).value = {
        text: 'omar.ola@distelsa.com.gt',
        hyperlink: 'mailto:omar.ola@distelsa.com.gt',
      };
      const filePath = path.join(tempDir, `hyperlink-${Date.now()}.xlsx`);
      await workbook.xlsx.writeFile(filePath);

      const rows: any[] = [];
      for await (const row of service.parseRows(filePath)) {
        rows.push(row);
      }

      expect(rows).toHaveLength(1);
      expect(rows[0].data.email).toBe('omar.ola@distelsa.com.gt');
      expect(typeof rows[0].data.email).toBe('string');
    });

    it('should handle multiple rows with various types', async () => {
      const filePath = await createTestXlsx(
        ['eventType', 'cycleId', 'email', 'amount', 'metadata'],
        [
          ['order.created', 'CYC-001', 'jane@example.com', 79.99, '{"key":"val"}'],
          ['order.shipped', 'CYC-002', 'john@example.com', 149.50, ''],
          ['order.cancelled', '', 'bob@example.com', 25.00, '[1,2,3]'],
        ],
      );

      const rows: any[] = [];
      for await (const row of service.parseRows(filePath)) {
        rows.push(row);
      }

      expect(rows).toHaveLength(3);
      expect(rows[0].data.metadata).toEqual({ key: 'val' });
      expect(rows[1].data.metadata).toBeUndefined(); // empty cell omitted
      expect(rows[2].data.metadata).toEqual([1, 2, 3]);
      expect(rows[2].data.cycleId).toBeUndefined(); // empty cell omitted
    });
  });

  describe('detectMode', () => {
    it('should detect standard mode when no item.* columns', () => {
      const result = service.detectMode([
        'eventType',
        'email',
        'name',
        'orderId',
      ]);

      expect(result.mode).toBe('standard');
      expect(result.itemColumns).toEqual([]);
      expect(result.orderColumns).toContain('email');
      expect(result.orderColumns).toContain('name');
      expect(result.orderColumns).toContain('orderId');
    });

    it('should detect group mode when item.* columns present', () => {
      const result = service.detectMode([
        'eventType',
        'orderId',
        'email',
        'item.sku',
        'item.qty',
      ]);

      expect(result.mode).toBe('group');
      expect(result.itemColumns).toEqual(['item.sku', 'item.qty']);
      expect(result.orderColumns).toContain('orderId');
      expect(result.orderColumns).toContain('email');
    });

    it('should exclude control columns from order columns', () => {
      const result = service.detectMode(['eventType', 'cycleId', 'email']);

      expect(result.orderColumns).toEqual(['email']);
      expect(result.orderColumns).not.toContain('eventType');
      expect(result.orderColumns).not.toContain('cycleId');
    });

    it('should exclude reserved columns from order columns', () => {
      const result = service.detectMode([
        'eventType',
        '_notification_status',
        'email',
      ]);

      expect(result.orderColumns).toEqual(['email']);
      expect(result.orderColumns).not.toContain('_notification_status');
    });

    it('should return empty item columns in standard mode', () => {
      const result = service.detectMode(['eventType', 'email']);
      expect(result.itemColumns).toEqual([]);
    });
  });
});
