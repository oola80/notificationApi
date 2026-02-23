import { Injectable } from '@nestjs/common';
import {
  TRANSFORM_REGISTRY,
  TransformContext,
} from './transforms/transform-registry.js';
import { extractValue, extractValues } from '../common/utils/dot-path.util.js';

export interface FieldMapping {
  source: string | string[];
  target: string;
  transform?: string;
  transformOptions?: Record<string, any>;
  defaultValue?: any;
  required?: boolean;
}

export interface NormalizationResult {
  normalizedFields: Record<string, any>;
  warnings: string[];
  missingRequiredFields: string[];
}

@Injectable()
export class MappingEngineService {
  normalizePayload(
    sourcePayload: Record<string, any>,
    fieldMappings: Record<string, FieldMapping>,
  ): NormalizationResult {
    const normalizedFields: Record<string, any> = {};
    const warnings: string[] = [];
    const missingRequiredFields: string[] = [];

    const context: TransformContext = { payload: sourcePayload };

    for (const [fieldName, mapping] of Object.entries(fieldMappings)) {
      try {
        const transformName = mapping.transform ?? 'direct';

        // Resolve source value
        let sourceValue: any;
        if (transformName === 'static') {
          sourceValue = null; // static ignores source
        } else if (Array.isArray(mapping.source)) {
          sourceValue = extractValues(sourcePayload, mapping.source);
        } else {
          sourceValue = extractValue(sourcePayload, mapping.source);
        }

        // Apply default if value is null/undefined
        if (
          (sourceValue === null || sourceValue === undefined) &&
          mapping.defaultValue !== undefined &&
          transformName !== 'static'
        ) {
          sourceValue = mapping.defaultValue;
        }

        // Check if transform exists
        const transformFn = TRANSFORM_REGISTRY[transformName];
        if (!transformFn) {
          warnings.push(
            `Unknown transform "${transformName}" for field "${fieldName}", skipped`,
          );
          continue;
        }

        // Apply transform
        const result = transformFn(
          sourceValue,
          mapping.transformOptions ?? {},
          context,
        );

        // Set target field
        const targetKey = mapping.target ?? fieldName;
        normalizedFields[targetKey] = result;

        // Check required
        if (mapping.required && (result === null || result === undefined)) {
          missingRequiredFields.push(fieldName);
        }
      } catch (error) {
        warnings.push(
          `Transform error for field "${fieldName}": ${(error as Error).message}`,
        );
        if (mapping.required) {
          missingRequiredFields.push(fieldName);
        }
      }
    }

    return { normalizedFields, warnings, missingRequiredFields };
  }
}
