import { extractValue } from '../../common/utils/dot-path.util.js';
import { JSONPath } from 'jsonpath-plus';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';

dayjs.extend(utc);
dayjs.extend(customParseFormat);

export interface TransformContext {
  payload: Record<string, any>;
}

export type TransformFunction = (
  value: any,
  options: Record<string, any>,
  context: TransformContext,
) => any;

const direct: TransformFunction = (value) => value;

const concatenate: TransformFunction = (value: string[], options) => {
  const separator = options.separator ?? '';
  return value.join(separator);
};

const map: TransformFunction = (value, options) => {
  const mappings = options.mappings as Record<string, any>;
  const key = String(value);
  return key in mappings ? mappings[key] : value;
};

const prefix: TransformFunction = (value, options) => {
  return options.prefix + String(value);
};

const suffix: TransformFunction = (value, options) => {
  return String(value) + options.suffix;
};

const template: TransformFunction = (_value, options, context) => {
  const templateStr = options.template as string;
  return templateStr.replace(/\{\{([^}]+)\}\}/g, (_match, path: string) => {
    const extracted = extractValue(context.payload, path.trim());
    return extracted !== undefined ? String(extracted) : '';
  });
};

const dateFormat: TransformFunction = (value, options) => {
  const parsed = options.inputFormat
    ? dayjs.utc(value, options.inputFormat, true)
    : dayjs.utc(value);
  if (!parsed.isValid()) {
    throw new Error(`dateFormat: invalid date value "${String(value)}"`);
  }
  return parsed.format(options.outputFormat);
};

const epochToIso: TransformFunction = (value, options) => {
  const unit = options.unit ?? 'ms';
  const num = typeof value === 'string' ? Number(value) : value;
  const ms = unit === 's' ? num * 1000 : num;
  const parsed = dayjs.utc(ms);
  if (!parsed.isValid()) {
    throw new Error(`epochToIso: invalid epoch value "${String(value)}"`);
  }
  return parsed.toISOString();
};

const toNumber: TransformFunction = (value) => {
  const num = Number(value);
  if (isNaN(num)) {
    throw new Error(`toNumber: cannot convert "${String(value)}" to number`);
  }
  return num;
};

const toString: TransformFunction = (value) => String(value);

const arrayMap: TransformFunction = (value: any[], options) => {
  const fieldRenames = options.fieldRenames as Record<string, string>;
  return value.map((item) => {
    const renamed: Record<string, any> = {};
    for (const [oldKey, newKey] of Object.entries(fieldRenames)) {
      if (oldKey in item) {
        renamed[newKey] = item[oldKey];
      }
    }
    // Keep fields that aren't in the rename map
    for (const key of Object.keys(item)) {
      if (!(key in fieldRenames)) {
        renamed[key] = item[key];
      }
    }
    return renamed;
  });
};

const jsonPath: TransformFunction = (_value, options, context) => {
  const result = JSONPath({
    path: options.expression,
    json: context.payload,
  });
  return result;
};

const staticTransform: TransformFunction = (_value, options) => {
  return options.value;
};

export const TRANSFORM_REGISTRY: Record<string, TransformFunction> = {
  direct,
  concatenate,
  map,
  prefix,
  suffix,
  template,
  dateFormat,
  epochToIso,
  toNumber,
  toString,
  arrayMap,
  jsonPath,
  static: staticTransform,
};
