import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ExcelJS from 'exceljs';
import {
  ParsedRow,
  ModeDetectionResult,
  GroupedRows,
  GroupedData,
} from './interfaces/parsed-row.interface.js';

const RESERVED_PREFIX = '_';
const CONTROL_COLUMNS = ['eventType', 'cycleId'];

@Injectable()
export class ParsingService {
  private readonly groupItemsPrefix: string;
  private readonly groupKeyColumn: string;

  constructor(private readonly configService: ConfigService) {
    this.groupItemsPrefix = this.configService.get<string>(
      'app.groupItemsPrefix',
      'item.',
    );
    this.groupKeyColumn = this.configService.get<string>(
      'app.groupKeyColumn',
      'orderId',
    );
  }

  async parseHeaders(filePath: string): Promise<string[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) return [];

    const headers: string[] = [];
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell({ includeEmpty: false }, (cell) => {
      const value = cell.value;
      if (value !== null && value !== undefined) {
        headers.push(String(value));
      }
    });

    return headers;
  }

  async *parseRows(filePath: string): AsyncGenerator<ParsedRow> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) return;

    // Extract headers from first row
    const headers: string[] = [];
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell({ includeEmpty: false }, (cell) => {
      const value = cell.value;
      if (value !== null && value !== undefined) {
        headers.push(String(value));
      }
    });

    if (headers.length === 0) return;

    // Iterate data rows (starting from row 2)
    for (let rowIdx = 2; rowIdx <= worksheet.rowCount; rowIdx++) {
      const row = worksheet.getRow(rowIdx);
      const data: Record<string, unknown> = {};
      let hasAnyValue = false;

      for (let colIndex = 0; colIndex < headers.length; colIndex++) {
        const header = headers[colIndex];
        const cell = row.getCell(colIndex + 1);
        const rawValue = cell.value;

        // Empty cells → omitted
        if (rawValue === null || rawValue === undefined || rawValue === '') {
          continue;
        }

        // Reserved columns (prefixed with _) → excluded
        if (header.startsWith(RESERVED_PREFIX)) {
          continue;
        }

        hasAnyValue = true;
        data[header] = this.coerceValue(rawValue);
      }

      if (!hasAnyValue) {
        continue; // Skip entirely empty rows
      }

      yield {
        rowNumber: rowIdx - 1, // 1-indexed data row number (header = row 1)
        data,
      };
    }
  }

  detectMode(headers: string[]): ModeDetectionResult {
    const itemColumns = headers.filter((h) =>
      h.startsWith(this.groupItemsPrefix),
    );
    const orderColumns = headers.filter(
      (h) =>
        !h.startsWith(this.groupItemsPrefix) &&
        !h.startsWith(RESERVED_PREFIX) &&
        !CONTROL_COLUMNS.includes(h),
    );

    if (itemColumns.length > 0) {
      return { mode: 'group', itemColumns, orderColumns };
    }

    return { mode: 'standard', itemColumns: [], orderColumns };
  }

  extractGroupData(
    modeResult: ModeDetectionResult,
    rows: ParsedRow[],
    conflictMode: 'warn' | 'strict' = 'warn',
  ): GroupedRows {
    const groups: GroupedRows = new Map();

    for (const row of rows) {
      const eventType = row.data.eventType as string | undefined;
      const groupKeyValue = row.data[this.groupKeyColumn] as
        | string
        | undefined;

      // Build composite key: eventType + groupKeyColumn value
      const compositeKey = `${eventType ?? ''}::${groupKeyValue ?? ''}`;

      if (!groups.has(compositeKey)) {
        // First row in this group — extract order-level fields
        const orderData: Record<string, unknown> = {};
        for (const col of modeResult.orderColumns) {
          if (row.data[col] !== undefined) {
            orderData[col] = row.data[col];
          }
        }

        // Extract item-level fields (strip prefix)
        const itemData: Record<string, unknown> = {};
        for (const col of modeResult.itemColumns) {
          const strippedKey = col.slice(this.groupItemsPrefix.length);
          if (row.data[col] !== undefined) {
            itemData[strippedKey] = row.data[col];
          }
        }

        groups.set(compositeKey, {
          orderData,
          items: Object.keys(itemData).length > 0 ? [itemData] : [],
          rowNumbers: [row.rowNumber],
          conflicts: [],
        });
      } else {
        const group = groups.get(compositeKey)!;

        // Conflict detection: check order-level fields against first row
        for (const col of modeResult.orderColumns) {
          const existingValue = group.orderData[col];
          const newValue = row.data[col];
          if (
            newValue !== undefined &&
            existingValue !== undefined &&
            JSON.stringify(existingValue) !== JSON.stringify(newValue)
          ) {
            group.conflicts.push(
              `Row ${row.rowNumber}: field '${col}' differs (first='${String(existingValue)}', current='${String(newValue)}')`,
            );
          }
        }

        // In warn mode, keep first row values (already set)
        // In strict mode, conflicts are flagged — handled by caller

        // Extract item-level fields (strip prefix)
        const itemData: Record<string, unknown> = {};
        for (const col of modeResult.itemColumns) {
          const strippedKey = col.slice(this.groupItemsPrefix.length);
          if (row.data[col] !== undefined) {
            itemData[strippedKey] = row.data[col];
          }
        }

        if (Object.keys(itemData).length > 0) {
          group.items.push(itemData);
        }
        group.rowNumbers.push(row.rowNumber);
      }
    }

    return groups;
  }

  private coerceValue(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    // ExcelJS may return rich text objects
    if (typeof value === 'object' && value !== null && 'richText' in value) {
      const richText = (value as { richText: Array<{ text: string }> })
        .richText;
      const text = richText.map((r) => r.text).join('');
      return this.coerceStringValue(text);
    }

    // ExcelJS hyperlink objects (e.g., mailto: links on email cells)
    if (
      typeof value === 'object' &&
      value !== null &&
      'text' in value &&
      'hyperlink' in value
    ) {
      return (value as { text: string; hyperlink: string }).text;
    }

    // ExcelJS may return Date objects
    if (value instanceof Date) {
      return value.toISOString();
    }

    // ExcelJS formula results
    if (
      typeof value === 'object' &&
      value !== null &&
      'result' in value
    ) {
      return this.coerceValue((value as { result: unknown }).result);
    }

    // Numbers stay as numbers
    if (typeof value === 'number') {
      return value;
    }

    // Boolean
    if (typeof value === 'boolean') {
      return value;
    }

    // String value — apply coercion rules
    if (typeof value === 'string') {
      return this.coerceStringValue(value);
    }

    return value;
  }

  private coerceStringValue(value: string): unknown {
    // Try JSON parsing (objects/arrays)
    if (
      (value.startsWith('{') && value.endsWith('}')) ||
      (value.startsWith('[') && value.endsWith(']'))
    ) {
      try {
        return JSON.parse(value);
      } catch {
        // Not valid JSON — return as string
      }
    }

    // Try numeric conversion
    if (value.trim() !== '' && !isNaN(Number(value))) {
      return Number(value);
    }

    return value;
  }
}
