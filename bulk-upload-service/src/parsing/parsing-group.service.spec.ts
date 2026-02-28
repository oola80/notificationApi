import { ConfigService } from '@nestjs/config';
import { ParsingService } from './parsing.service.js';
import {
  ModeDetectionResult,
  ParsedRow,
} from './interfaces/parsed-row.interface.js';

describe('ParsingService — extractGroupData', () => {
  let service: ParsingService;
  let configService: any;

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

  // Helper to build a ModeDetectionResult for group mode
  function groupMode(
    orderColumns: string[],
    itemColumns: string[],
  ): ModeDetectionResult {
    return { mode: 'group', orderColumns, itemColumns };
  }

  // Helper to build a ParsedRow
  function row(rowNumber: number, data: Record<string, unknown>): ParsedRow {
    return { rowNumber, data };
  }

  // ---------- Test 1 ----------
  it('should group rows by composite key (eventType + orderId)', () => {
    const mode = groupMode(['orderId', 'email'], ['item.sku']);
    const rows: ParsedRow[] = [
      row(1, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        email: 'a@b.com',
        'item.sku': 'SKU-A',
      }),
      row(2, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        email: 'a@b.com',
        'item.sku': 'SKU-B',
      }),
    ];

    const result = service.extractGroupData(mode, rows);

    expect(result.size).toBe(1);
    const key = 'order.created::ORD-001';
    expect(result.has(key)).toBe(true);
    const group = result.get(key)!;
    expect(group.items).toHaveLength(2);
    expect(group.rowNumbers).toEqual([1, 2]);
  });

  // ---------- Test 2 ----------
  it('should extract order-level fields from the first row', () => {
    const mode = groupMode(['orderId', 'email', 'customerName'], ['item.sku']);
    const rows: ParsedRow[] = [
      row(1, {
        eventType: 'order.created',
        orderId: 'ORD-100',
        email: 'first@test.com',
        customerName: 'Alice',
        'item.sku': 'P1',
      }),
      row(2, {
        eventType: 'order.created',
        orderId: 'ORD-100',
        email: 'first@test.com',
        customerName: 'Alice',
        'item.sku': 'P2',
      }),
    ];

    const result = service.extractGroupData(mode, rows);
    const group = result.get('order.created::ORD-100')!;

    expect(group.orderData).toEqual({
      orderId: 'ORD-100',
      email: 'first@test.com',
      customerName: 'Alice',
    });
  });

  // ---------- Test 3 ----------
  it('should strip item. prefix from item columns', () => {
    const mode = groupMode(['orderId'], ['item.sku', 'item.qty']);
    const rows: ParsedRow[] = [
      row(1, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        'item.sku': 'ABC',
        'item.qty': 3,
      }),
    ];

    const result = service.extractGroupData(mode, rows);
    const group = result.get('order.created::ORD-001')!;

    expect(group.items).toHaveLength(1);
    expect(group.items[0]).toEqual({ sku: 'ABC', qty: 3 });
    // Verify original prefixed keys are NOT present
    expect(group.items[0]).not.toHaveProperty('item.sku');
    expect(group.items[0]).not.toHaveProperty('item.qty');
  });

  // ---------- Test 4 ----------
  it('should collect items from all rows in a group', () => {
    const mode = groupMode(['orderId'], ['item.sku', 'item.price']);
    const rows: ParsedRow[] = [
      row(1, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        'item.sku': 'A',
        'item.price': 10,
      }),
      row(2, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        'item.sku': 'B',
        'item.price': 20,
      }),
      row(3, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        'item.sku': 'C',
        'item.price': 30,
      }),
    ];

    const result = service.extractGroupData(mode, rows);
    const group = result.get('order.created::ORD-001')!;

    expect(group.items).toHaveLength(3);
    expect(group.items[0]).toEqual({ sku: 'A', price: 10 });
    expect(group.items[1]).toEqual({ sku: 'B', price: 20 });
    expect(group.items[2]).toEqual({ sku: 'C', price: 30 });
  });

  // ---------- Test 5 ----------
  it('should handle a single-row group correctly', () => {
    const mode = groupMode(['orderId', 'email'], ['item.sku']);
    const rows: ParsedRow[] = [
      row(7, {
        eventType: 'order.shipped',
        orderId: 'ORD-999',
        email: 'solo@test.com',
        'item.sku': 'ONLY-ONE',
      }),
    ];

    const result = service.extractGroupData(mode, rows);

    expect(result.size).toBe(1);
    const group = result.get('order.shipped::ORD-999')!;
    expect(group.orderData).toEqual({
      orderId: 'ORD-999',
      email: 'solo@test.com',
    });
    expect(group.items).toEqual([{ sku: 'ONLY-ONE' }]);
    expect(group.rowNumbers).toEqual([7]);
    expect(group.conflicts).toEqual([]);
  });

  // ---------- Test 6 ----------
  it('should create multiple groups from different composite keys', () => {
    const mode = groupMode(['orderId', 'email'], ['item.sku']);
    const rows: ParsedRow[] = [
      row(1, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        email: 'a@b.com',
        'item.sku': 'P1',
      }),
      row(2, {
        eventType: 'order.created',
        orderId: 'ORD-002',
        email: 'c@d.com',
        'item.sku': 'P2',
      }),
      row(3, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        email: 'a@b.com',
        'item.sku': 'P3',
      }),
    ];

    const result = service.extractGroupData(mode, rows);

    expect(result.size).toBe(2);
    expect(result.has('order.created::ORD-001')).toBe(true);
    expect(result.has('order.created::ORD-002')).toBe(true);

    const group1 = result.get('order.created::ORD-001')!;
    expect(group1.items).toHaveLength(2);
    expect(group1.rowNumbers).toEqual([1, 3]);

    const group2 = result.get('order.created::ORD-002')!;
    expect(group2.items).toHaveLength(1);
    expect(group2.rowNumbers).toEqual([2]);
  });

  // ---------- Test 7 ----------
  it('should produce empty items array when no item columns are defined', () => {
    const mode = groupMode(['orderId', 'email'], []);
    const rows: ParsedRow[] = [
      row(1, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        email: 'x@y.com',
      }),
      row(2, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        email: 'x@y.com',
      }),
    ];

    const result = service.extractGroupData(mode, rows);
    const group = result.get('order.created::ORD-001')!;

    expect(group.items).toEqual([]);
  });

  // ---------- Test 8 ----------
  it('should detect conflicts when order-level fields differ across rows', () => {
    const mode = groupMode(['orderId', 'email'], ['item.sku']);
    const rows: ParsedRow[] = [
      row(1, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        email: 'first@test.com',
        'item.sku': 'A',
      }),
      row(2, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        email: 'different@test.com',
        'item.sku': 'B',
      }),
    ];

    const result = service.extractGroupData(mode, rows, 'warn');
    const group = result.get('order.created::ORD-001')!;

    expect(group.conflicts).toHaveLength(1);
    expect(group.conflicts[0]).toContain("field 'email' differs");
    expect(group.conflicts[0]).toContain('first@test.com');
    expect(group.conflicts[0]).toContain('different@test.com');
    expect(group.conflicts[0]).toContain('Row 2');
  });

  // ---------- Test 9 ----------
  it('should keep first row values in warn mode when conflicts exist', () => {
    const mode = groupMode(['orderId', 'email', 'amount'], ['item.sku']);
    const rows: ParsedRow[] = [
      row(1, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        email: 'winner@test.com',
        amount: 100,
        'item.sku': 'A',
      }),
      row(2, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        email: 'loser@test.com',
        amount: 200,
        'item.sku': 'B',
      }),
    ];

    const result = service.extractGroupData(mode, rows, 'warn');
    const group = result.get('order.created::ORD-001')!;

    // First row values are kept
    expect(group.orderData.email).toBe('winner@test.com');
    expect(group.orderData.amount).toBe(100);

    // Both conflicts recorded
    expect(group.conflicts).toHaveLength(2);
    expect(group.conflicts.some((c) => c.includes("field 'email'"))).toBe(
      true,
    );
    expect(group.conflicts.some((c) => c.includes("field 'amount'"))).toBe(
      true,
    );
  });

  // ---------- Test 10 ----------
  it('should record conflicts in strict mode (same behavior, caller checks)', () => {
    const mode = groupMode(['orderId', 'email'], ['item.sku']);
    const rows: ParsedRow[] = [
      row(1, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        email: 'first@test.com',
        'item.sku': 'A',
      }),
      row(2, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        email: 'second@test.com',
        'item.sku': 'B',
      }),
    ];

    const result = service.extractGroupData(mode, rows, 'strict');
    const group = result.get('order.created::ORD-001')!;

    // Conflicts are recorded
    expect(group.conflicts).toHaveLength(1);
    expect(group.conflicts[0]).toContain("field 'email' differs");

    // First row values are still kept (strict does not change values either)
    expect(group.orderData.email).toBe('first@test.com');
  });

  // ---------- Test 11 ----------
  it('should report no conflicts when all order-level fields match', () => {
    const mode = groupMode(
      ['orderId', 'email', 'customerName'],
      ['item.sku'],
    );
    const rows: ParsedRow[] = [
      row(1, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        email: 'same@test.com',
        customerName: 'Bob',
        'item.sku': 'A',
      }),
      row(2, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        email: 'same@test.com',
        customerName: 'Bob',
        'item.sku': 'B',
      }),
      row(3, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        email: 'same@test.com',
        customerName: 'Bob',
        'item.sku': 'C',
      }),
    ];

    const result = service.extractGroupData(mode, rows);
    const group = result.get('order.created::ORD-001')!;

    expect(group.conflicts).toEqual([]);
  });

  // ---------- Test 12 ----------
  it('should handle missing groupKeyColumn value in some rows', () => {
    const mode = groupMode(['orderId', 'email'], ['item.sku']);
    const rows: ParsedRow[] = [
      row(1, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        email: 'a@b.com',
        'item.sku': 'A',
      }),
      row(2, {
        eventType: 'order.created',
        email: 'c@d.com',
        'item.sku': 'B',
      }), // missing orderId
      row(3, {
        eventType: 'order.created',
        email: 'e@f.com',
        'item.sku': 'C',
      }), // missing orderId
    ];

    const result = service.extractGroupData(mode, rows);

    // Row 1 gets its own group with orderId=ORD-001
    expect(result.has('order.created::ORD-001')).toBe(true);

    // Rows 2 and 3 share a group with empty orderId (composite key: "order.created::")
    expect(result.has('order.created::')).toBe(true);
    const missingGroup = result.get('order.created::')!;
    expect(missingGroup.rowNumbers).toEqual([2, 3]);
    expect(missingGroup.items).toHaveLength(2);
  });

  // ---------- Test 13 ----------
  it('should collect multiple item columns correctly per row', () => {
    const mode = groupMode(
      ['orderId'],
      ['item.sku', 'item.qty', 'item.price', 'item.name'],
    );
    const rows: ParsedRow[] = [
      row(1, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        'item.sku': 'SKU-1',
        'item.qty': 2,
        'item.price': 19.99,
        'item.name': 'Widget',
      }),
      row(2, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        'item.sku': 'SKU-2',
        'item.qty': 1,
        'item.price': 49.99,
        'item.name': 'Gadget',
      }),
    ];

    const result = service.extractGroupData(mode, rows);
    const group = result.get('order.created::ORD-001')!;

    expect(group.items).toHaveLength(2);
    expect(group.items[0]).toEqual({
      sku: 'SKU-1',
      qty: 2,
      price: 19.99,
      name: 'Widget',
    });
    expect(group.items[1]).toEqual({
      sku: 'SKU-2',
      qty: 1,
      price: 49.99,
      name: 'Gadget',
    });
  });

  // ---------- Test 14 ----------
  it('should not add empty item objects when row has no item data', () => {
    const mode = groupMode(['orderId', 'email'], ['item.sku', 'item.qty']);
    const rows: ParsedRow[] = [
      row(1, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        email: 'a@b.com',
        'item.sku': 'A',
        'item.qty': 1,
      }),
      row(2, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        email: 'a@b.com',
        // No item.sku or item.qty — row has no item-level data
      }),
    ];

    const result = service.extractGroupData(mode, rows);
    const group = result.get('order.created::ORD-001')!;

    // Only row 1 contributed an item; row 2 had no item data
    expect(group.items).toHaveLength(1);
    expect(group.items[0]).toEqual({ sku: 'A', qty: 1 });
    // But row 2 is still tracked
    expect(group.rowNumbers).toEqual([1, 2]);
  });

  // ---------- Test 15 ----------
  it('should create separate groups for mixed eventTypes with same orderId', () => {
    const mode = groupMode(['orderId', 'email'], ['item.sku']);
    const rows: ParsedRow[] = [
      row(1, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        email: 'a@b.com',
        'item.sku': 'A',
      }),
      row(2, {
        eventType: 'order.shipped',
        orderId: 'ORD-001',
        email: 'a@b.com',
        'item.sku': 'B',
      }),
      row(3, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        email: 'a@b.com',
        'item.sku': 'C',
      }),
    ];

    const result = service.extractGroupData(mode, rows);

    expect(result.size).toBe(2);
    expect(result.has('order.created::ORD-001')).toBe(true);
    expect(result.has('order.shipped::ORD-001')).toBe(true);

    const createdGroup = result.get('order.created::ORD-001')!;
    expect(createdGroup.items).toHaveLength(2);
    expect(createdGroup.items[0]).toEqual({ sku: 'A' });
    expect(createdGroup.items[1]).toEqual({ sku: 'C' });
    expect(createdGroup.rowNumbers).toEqual([1, 3]);

    const shippedGroup = result.get('order.shipped::ORD-001')!;
    expect(shippedGroup.items).toHaveLength(1);
    expect(shippedGroup.items[0]).toEqual({ sku: 'B' });
    expect(shippedGroup.rowNumbers).toEqual([2]);
  });

  // ---------- Test 16 ----------
  it('should track row numbers correctly per group', () => {
    const mode = groupMode(['orderId'], ['item.sku']);
    const rows: ParsedRow[] = [
      row(5, {
        eventType: 'order.created',
        orderId: 'ORD-A',
        'item.sku': 'P1',
      }),
      row(6, {
        eventType: 'order.created',
        orderId: 'ORD-B',
        'item.sku': 'P2',
      }),
      row(7, {
        eventType: 'order.created',
        orderId: 'ORD-A',
        'item.sku': 'P3',
      }),
      row(8, {
        eventType: 'order.created',
        orderId: 'ORD-B',
        'item.sku': 'P4',
      }),
      row(9, {
        eventType: 'order.created',
        orderId: 'ORD-A',
        'item.sku': 'P5',
      }),
    ];

    const result = service.extractGroupData(mode, rows);

    const groupA = result.get('order.created::ORD-A')!;
    expect(groupA.rowNumbers).toEqual([5, 7, 9]);

    const groupB = result.get('order.created::ORD-B')!;
    expect(groupB.rowNumbers).toEqual([6, 8]);
  });

  // ---------- Additional edge-case tests ----------

  it('should handle empty rows array returning an empty map', () => {
    const mode = groupMode(['orderId', 'email'], ['item.sku']);
    const result = service.extractGroupData(mode, []);

    expect(result.size).toBe(0);
    expect(result).toBeInstanceOf(Map);
  });

  it('should default conflictMode to warn when not specified', () => {
    const mode = groupMode(['orderId', 'email'], ['item.sku']);
    const rows: ParsedRow[] = [
      row(1, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        email: 'first@test.com',
        'item.sku': 'A',
      }),
      row(2, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        email: 'different@test.com',
        'item.sku': 'B',
      }),
    ];

    // Call without third argument — should default to 'warn' and still record conflicts
    const result = service.extractGroupData(mode, rows);
    const group = result.get('order.created::ORD-001')!;

    expect(group.conflicts).toHaveLength(1);
    expect(group.orderData.email).toBe('first@test.com');
  });

  it('should handle rows with missing eventType using empty string in composite key', () => {
    const mode = groupMode(['orderId'], ['item.sku']);
    const rows: ParsedRow[] = [
      row(1, { orderId: 'ORD-001', 'item.sku': 'A' }), // no eventType
      row(2, { orderId: 'ORD-001', 'item.sku': 'B' }), // no eventType
    ];

    const result = service.extractGroupData(mode, rows);

    expect(result.size).toBe(1);
    expect(result.has('::ORD-001')).toBe(true);
    const group = result.get('::ORD-001')!;
    expect(group.items).toHaveLength(2);
    expect(group.rowNumbers).toEqual([1, 2]);
  });

  it('should not report conflict when second row has undefined order field and first has a value', () => {
    const mode = groupMode(['orderId', 'email', 'customerName'], ['item.sku']);
    const rows: ParsedRow[] = [
      row(1, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        email: 'a@b.com',
        customerName: 'Alice',
        'item.sku': 'A',
      }),
      row(2, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        // email and customerName missing (undefined) — should NOT trigger conflict
        'item.sku': 'B',
      }),
    ];

    const result = service.extractGroupData(mode, rows);
    const group = result.get('order.created::ORD-001')!;

    // No conflict — the second row simply does not have the fields
    expect(group.conflicts).toEqual([]);
    expect(group.orderData.email).toBe('a@b.com');
    expect(group.orderData.customerName).toBe('Alice');
  });

  it('should detect conflicts across multiple subsequent rows, not just row 2', () => {
    const mode = groupMode(['orderId', 'email'], ['item.sku']);
    const rows: ParsedRow[] = [
      row(1, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        email: 'original@test.com',
        'item.sku': 'A',
      }),
      row(2, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        email: 'original@test.com',
        'item.sku': 'B',
      }),
      row(3, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        email: 'changed@test.com',
        'item.sku': 'C',
      }),
      row(4, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        email: 'another@test.com',
        'item.sku': 'D',
      }),
    ];

    const result = service.extractGroupData(mode, rows, 'warn');
    const group = result.get('order.created::ORD-001')!;

    // Row 2 matches, rows 3 and 4 conflict
    expect(group.conflicts).toHaveLength(2);
    expect(group.conflicts[0]).toContain('Row 3');
    expect(group.conflicts[1]).toContain('Row 4');
    expect(group.orderData.email).toBe('original@test.com');
  });

  it('should handle order columns with undefined values in the first row', () => {
    const mode = groupMode(['orderId', 'email', 'phone'], ['item.sku']);
    const rows: ParsedRow[] = [
      row(1, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        email: 'a@b.com',
        // phone is undefined
        'item.sku': 'A',
      }),
    ];

    const result = service.extractGroupData(mode, rows);
    const group = result.get('order.created::ORD-001')!;

    // Only defined order fields are captured
    expect(group.orderData).toEqual({
      orderId: 'ORD-001',
      email: 'a@b.com',
    });
    expect(group.orderData).not.toHaveProperty('phone');
  });

  it('should handle item columns where only some are present per row', () => {
    const mode = groupMode(['orderId'], ['item.sku', 'item.qty', 'item.note']);
    const rows: ParsedRow[] = [
      row(1, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        'item.sku': 'A',
        'item.qty': 5,
        // item.note missing
      }),
      row(2, {
        eventType: 'order.created',
        orderId: 'ORD-001',
        'item.sku': 'B',
        // item.qty missing
        'item.note': 'fragile',
      }),
    ];

    const result = service.extractGroupData(mode, rows);
    const group = result.get('order.created::ORD-001')!;

    expect(group.items).toHaveLength(2);
    expect(group.items[0]).toEqual({ sku: 'A', qty: 5 });
    expect(group.items[1]).toEqual({ sku: 'B', note: 'fragile' });
  });
});
