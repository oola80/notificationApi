import { Injectable } from '@nestjs/common';
import { RecipientGroupsRepository } from './recipient-groups.repository.js';
import { ResolvedRecipient } from './interfaces/resolved-recipient.interface.js';
import { createErrorResponse } from '../common/errors.js';

@Injectable()
export class RecipientResolverService {
  constructor(private readonly repository: RecipientGroupsRepository) {}

  async resolveRecipients(
    action: {
      recipientType: string;
      recipientGroupId?: string;
      customRecipients?: Record<string, any>[];
    },
    eventPayload: Record<string, any>,
  ): Promise<ResolvedRecipient[]> {
    switch (action.recipientType) {
      case 'customer':
        return this.resolveCustomer(eventPayload);
      case 'group':
        return this.resolveGroup(action.recipientGroupId);
      case 'custom':
        return this.resolveCustom(action.customRecipients);
      default:
        return [];
    }
  }

  private resolveCustomer(
    eventPayload: Record<string, any>,
  ): ResolvedRecipient[] {
    const recipient: ResolvedRecipient = {};

    if (eventPayload.customerEmail) {
      recipient.email = eventPayload.customerEmail;
    }
    if (eventPayload.customerPhone) {
      recipient.phone = eventPayload.customerPhone;
    }
    if (eventPayload.deviceToken) {
      recipient.deviceToken = eventPayload.deviceToken;
    }
    if (eventPayload.customerId) {
      recipient.customerId = eventPayload.customerId;
    }
    if (eventPayload.customerName) {
      recipient.name = eventPayload.customerName;
    }

    return [recipient];
  }

  private async resolveGroup(groupId?: string): Promise<ResolvedRecipient[]> {
    if (!groupId) {
      throw createErrorResponse('NES-004');
    }

    const members = await this.repository.findActiveMembers(groupId);

    if (members.length === 0) {
      const group = await this.repository.findById(groupId);
      if (!group || !group.isActive) {
        throw createErrorResponse('NES-004');
      }
    }

    return members.map((m) => ({
      email: m.email,
      phone: m.phone ?? undefined,
      deviceToken: m.deviceToken ?? undefined,
      name: m.memberName ?? undefined,
    }));
  }

  private resolveCustom(
    customRecipients?: Record<string, any>[],
  ): ResolvedRecipient[] {
    if (!customRecipients || customRecipients.length === 0) {
      return [];
    }

    return customRecipients.map((r) => ({
      email: r.email,
      phone: r.phone,
      deviceToken: r.deviceToken,
      name: r.name ?? r.memberName,
      customerId: r.customerId,
    }));
  }
}
