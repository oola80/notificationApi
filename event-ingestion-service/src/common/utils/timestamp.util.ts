import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';

dayjs.extend(utc);
dayjs.extend(customParseFormat);

export function normalizeTimestamp(
  value: string | number | null | undefined,
  format?: string,
): string {
  if (value === null || value === undefined) {
    return dayjs.utc().toISOString();
  }

  const fmt = format ?? 'iso8601';

  if (fmt === 'iso8601') {
    const parsed = dayjs.utc(value);
    if (!parsed.isValid()) {
      throw new Error(`Invalid ISO-8601 timestamp: ${String(value)}`);
    }
    return parsed.toISOString();
  }

  if (fmt === 'epoch_ms') {
    const ms = typeof value === 'string' ? Number(value) : value;
    if (isNaN(ms)) {
      throw new Error(`Invalid epoch_ms timestamp: ${String(value)}`);
    }
    const parsed = dayjs.utc(ms);
    if (!parsed.isValid()) {
      throw new Error(`Invalid epoch_ms timestamp: ${String(value)}`);
    }
    return parsed.toISOString();
  }

  if (fmt === 'epoch_s') {
    const s = typeof value === 'string' ? Number(value) : value;
    if (isNaN(s)) {
      throw new Error(`Invalid epoch_s timestamp: ${String(value)}`);
    }
    const parsed = dayjs.utc(s * 1000);
    if (!parsed.isValid()) {
      throw new Error(`Invalid epoch_s timestamp: ${String(value)}`);
    }
    return parsed.toISOString();
  }

  // Custom dayjs format string
  const parsed = dayjs.utc(String(value), fmt, true);
  if (!parsed.isValid()) {
    throw new Error(`Invalid timestamp "${String(value)}" for format "${fmt}"`);
  }
  return parsed.toISOString();
}
