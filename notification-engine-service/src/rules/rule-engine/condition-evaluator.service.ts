import { Injectable } from '@nestjs/common';

@Injectable()
export class ConditionEvaluatorService {
  evaluateConditions(
    conditions: Record<string, any> | null | undefined,
    payload: Record<string, any>,
  ): boolean {
    if (!conditions || Object.keys(conditions).length === 0) {
      return true;
    }

    return Object.entries(conditions).every(([field, condition]) =>
      this.evaluateField(field, condition, payload),
    );
  }

  private evaluateField(
    field: string,
    condition: any,
    payload: Record<string, any>,
  ): boolean {
    const value = payload[field];

    if (
      condition !== null &&
      typeof condition === 'object' &&
      !Array.isArray(condition)
    ) {
      return Object.entries(condition).every(([operator, operand]) =>
        this.evaluateOperator(operator, value, operand),
      );
    }

    return this.evaluateOperator('$eq', value, condition);
  }

  private evaluateOperator(
    operator: string,
    value: any,
    operand: any,
  ): boolean {
    switch (operator) {
      case '$eq':
        return value === operand;

      case '$ne':
        return value !== operand;

      case '$in':
        return Array.isArray(operand) && operand.includes(value);

      case '$nin':
        return Array.isArray(operand) && !operand.includes(value);

      case '$gt':
        return (
          typeof value === 'number' &&
          typeof operand === 'number' &&
          value > operand
        );

      case '$gte':
        return (
          typeof value === 'number' &&
          typeof operand === 'number' &&
          value >= operand
        );

      case '$lt':
        return (
          typeof value === 'number' &&
          typeof operand === 'number' &&
          value < operand
        );

      case '$lte':
        return (
          typeof value === 'number' &&
          typeof operand === 'number' &&
          value <= operand
        );

      case '$exists':
        return operand ? value !== undefined : value === undefined;

      case '$regex':
        try {
          return (
            typeof value === 'string' &&
            new RegExp(operand as string).test(value)
          );
        } catch {
          return false;
        }

      default:
        return false;
    }
  }
}
