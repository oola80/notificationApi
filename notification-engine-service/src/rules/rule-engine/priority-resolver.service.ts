import { Injectable } from '@nestjs/common';

@Injectable()
export class PriorityResolverService {
  resolveEffectivePriority(
    eventPriority: string,
    ruleDeliveryPriority: string | null | undefined,
  ): string {
    if (ruleDeliveryPriority) {
      return ruleDeliveryPriority;
    }
    return eventPriority;
  }
}
