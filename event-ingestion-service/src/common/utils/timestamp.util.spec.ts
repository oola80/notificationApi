import { normalizeTimestamp } from './timestamp.util.js';

describe('timestamp.util', () => {
  it('should return current UTC timestamp when value is null', () => {
    const result = normalizeTimestamp(null);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('should return current UTC timestamp when value is undefined', () => {
    const result = normalizeTimestamp(undefined);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('should passthrough and validate iso8601 format', () => {
    const result = normalizeTimestamp('2024-01-15T10:30:00Z', 'iso8601');
    expect(result).toBe('2024-01-15T10:30:00.000Z');
  });

  it('should throw on invalid iso8601', () => {
    expect(() => normalizeTimestamp('not-a-date', 'iso8601')).toThrow(
      'Invalid ISO-8601 timestamp',
    );
  });

  it('should convert epoch_ms to ISO-8601', () => {
    const result = normalizeTimestamp(1705314600000, 'epoch_ms');
    expect(result).toBe('2024-01-15T10:30:00.000Z');
  });

  it('should convert epoch_s to ISO-8601', () => {
    const result = normalizeTimestamp(1705314600, 'epoch_s');
    expect(result).toBe('2024-01-15T10:30:00.000Z');
  });

  it('should parse custom dayjs format string', () => {
    const result = normalizeTimestamp('15/01/2024 10:30', 'DD/MM/YYYY HH:mm');
    expect(result).toBe('2024-01-15T10:30:00.000Z');
  });

  it('should throw on invalid custom format', () => {
    expect(() => normalizeTimestamp('bad-data', 'DD/MM/YYYY')).toThrow(
      'Invalid timestamp',
    );
  });

  it('should default to iso8601 when format is not specified', () => {
    const result = normalizeTimestamp('2024-01-15T10:30:00Z');
    expect(result).toBe('2024-01-15T10:30:00.000Z');
  });
});
