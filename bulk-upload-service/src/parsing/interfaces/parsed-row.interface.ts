export interface ParsedRow {
  rowNumber: number;
  data: Record<string, unknown>;
}

export interface ModeDetectionResult {
  mode: 'standard' | 'group';
  itemColumns: string[];
  orderColumns: string[];
}

export interface GroupedData {
  orderData: Record<string, unknown>;
  items: Record<string, unknown>[];
  rowNumbers: number[];
  conflicts: string[];
}

export type GroupedRows = Map<string, GroupedData>;
