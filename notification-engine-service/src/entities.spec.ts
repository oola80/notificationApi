import { getMetadataArgsStorage } from 'typeorm';
import { NotificationRule } from './rules/entities/notification-rule.entity.js';
import { RecipientGroup } from './recipients/entities/recipient-group.entity.js';
import { RecipientGroupMember } from './recipients/entities/recipient-group-member.entity.js';
import { CustomerChannelPreference } from './preferences/entities/customer-channel-preference.entity.js';
import { CriticalChannelOverride } from './overrides/entities/critical-channel-override.entity.js';
import { Notification } from './notifications/entities/notification.entity.js';
import { NotificationStatusLog } from './notifications/entities/notification-status-log.entity.js';
import { NotificationRecipient } from './notifications/entities/notification-recipient.entity.js';

function getColumnsFor(entity: Function) {
  return getMetadataArgsStorage().columns.filter(
    (c) => c.target === entity,
  );
}

function getColumnByProperty(entity: Function, property: string) {
  return getColumnsFor(entity).find((c) => c.propertyName === property);
}

function getRelationsFor(entity: Function) {
  return getMetadataArgsStorage().relations.filter(
    (r) => r.target === entity,
  );
}

describe('Entity metadata', () => {
  describe('NotificationRule', () => {
    it('should be registered with table name notification_rules', () => {
      const tables = getMetadataArgsStorage().tables;
      const table = tables.find((t) => t.target === NotificationRule);
      expect(table).toBeDefined();
      expect(table!.name).toBe('notification_rules');
    });

    it('should have UUID PK', () => {
      const generated = getMetadataArgsStorage().generations.find(
        (g) => g.target === NotificationRule,
      );
      expect(generated).toBeDefined();
      expect(generated!.strategy).toBe('uuid');
    });

    it('should have 15 columns', () => {
      const cols = getColumnsFor(NotificationRule);
      expect(cols.length).toBe(15);
    });

    it('should have snake_case column names for camelCase properties', () => {
      const eventType = getColumnByProperty(NotificationRule, 'eventType');
      expect(eventType?.options?.name).toBe('event_type');

      const deliveryPriority = getColumnByProperty(NotificationRule, 'deliveryPriority');
      expect(deliveryPriority?.options?.name).toBe('delivery_priority');

      const isExclusive = getColumnByProperty(NotificationRule, 'isExclusive');
      expect(isExclusive?.options?.name).toBe('is_exclusive');
    });

    it('should have 3 JSONB columns', () => {
      const jsonbCols = getColumnsFor(NotificationRule).filter(
        (c) => c.options?.type === 'jsonb',
      );
      expect(jsonbCols.length).toBe(3);
      const names = jsonbCols.map((c) => c.propertyName);
      expect(names).toContain('conditions');
      expect(names).toContain('actions');
      expect(names).toContain('suppression');
    });

    it('should have priority default 100', () => {
      const priority = getColumnByProperty(NotificationRule, 'priority');
      expect(priority?.options?.default).toBe(100);
    });
  });

  describe('RecipientGroup', () => {
    it('should have UUID PK', () => {
      const generated = getMetadataArgsStorage().generations.find(
        (g) => g.target === RecipientGroup,
      );
      expect(generated!.strategy).toBe('uuid');
    });

    it('should have OneToMany relation to members', () => {
      const relations = getRelationsFor(RecipientGroup);
      const membersRel = relations.find((r) => r.propertyName === 'members');
      expect(membersRel).toBeDefined();
      expect(membersRel!.relationType).toBe('one-to-many');
    });

    it('should have isActive default true', () => {
      const isActive = getColumnByProperty(RecipientGroup, 'isActive');
      expect(isActive?.options?.default).toBe(true);
    });
  });

  describe('RecipientGroupMember', () => {
    it('should have bigint PK', () => {
      const generated = getMetadataArgsStorage().generations.find(
        (g) => g.target === RecipientGroupMember,
      );
      expect(generated).toBeDefined();
    });

    it('should have ManyToOne relation to group', () => {
      const relations = getRelationsFor(RecipientGroupMember);
      const groupRel = relations.find((r) => r.propertyName === 'group');
      expect(groupRel).toBeDefined();
      expect(groupRel!.relationType).toBe('many-to-one');
    });

    it('should have groupId FK column', () => {
      const groupId = getColumnByProperty(RecipientGroupMember, 'groupId');
      expect(groupId).toBeDefined();
      expect(groupId?.options?.name).toBe('group_id');
    });
  });

  describe('CustomerChannelPreference', () => {
    it('should have bigint PK', () => {
      const generated = getMetadataArgsStorage().generations.find(
        (g) => g.target === CustomerChannelPreference,
      );
      expect(generated).toBeDefined();
    });

    it('should have customerId and channel columns', () => {
      const customerId = getColumnByProperty(CustomerChannelPreference, 'customerId');
      expect(customerId?.options?.name).toBe('customer_id');

      const channel = getColumnByProperty(CustomerChannelPreference, 'channel');
      expect(channel).toBeDefined();
    });
  });

  describe('CriticalChannelOverride', () => {
    it('should have UUID PK', () => {
      const generated = getMetadataArgsStorage().generations.find(
        (g) => g.target === CriticalChannelOverride,
      );
      expect(generated!.strategy).toBe('uuid');
    });

    it('should have eventType and channel columns', () => {
      const eventType = getColumnByProperty(CriticalChannelOverride, 'eventType');
      expect(eventType?.options?.name).toBe('event_type');

      const channel = getColumnByProperty(CriticalChannelOverride, 'channel');
      expect(channel).toBeDefined();
    });
  });

  describe('Notification', () => {
    it('should have bigint PK', () => {
      const generated = getMetadataArgsStorage().generations.find(
        (g) => g.target === Notification,
      );
      expect(generated).toBeDefined();
    });

    it('should have UUID notificationId with unique and default', () => {
      const notifId = getColumnByProperty(Notification, 'notificationId');
      expect(notifId?.options?.name).toBe('notification_id');
      expect(notifId?.options?.unique).toBe(true);
    });

    it('should have status default PENDING', () => {
      const status = getColumnByProperty(Notification, 'status');
      expect(status?.options?.default).toBe('PENDING');
    });

    it('should have both CreateDateColumn and UpdateDateColumn', () => {
      const cols = getColumnsFor(Notification);
      const createDate = cols.find(
        (c) => c.propertyName === 'createdAt' && c.mode === 'createDate',
      );
      const updateDate = cols.find(
        (c) => c.propertyName === 'updatedAt' && c.mode === 'updateDate',
      );
      expect(createDate).toBeDefined();
      expect(updateDate).toBeDefined();
    });
  });

  describe('NotificationStatusLog', () => {
    it('should have bigint PK', () => {
      const generated = getMetadataArgsStorage().generations.find(
        (g) => g.target === NotificationStatusLog,
      );
      expect(generated).toBeDefined();
    });

    it('should be immutable (CreateDateColumn only, no UpdateDateColumn)', () => {
      const cols = getColumnsFor(NotificationStatusLog);
      const createDate = cols.find((c) => c.mode === 'createDate');
      const updateDate = cols.find((c) => c.mode === 'updateDate');
      expect(createDate).toBeDefined();
      expect(updateDate).toBeUndefined();
    });

    it('should have metadata JSONB column', () => {
      const metadata = getColumnByProperty(NotificationStatusLog, 'metadata');
      expect(metadata?.options?.type).toBe('jsonb');
      expect(metadata?.options?.nullable).toBe(true);
    });
  });

  describe('NotificationRecipient', () => {
    it('should have bigint PK', () => {
      const generated = getMetadataArgsStorage().generations.find(
        (g) => g.target === NotificationRecipient,
      );
      expect(generated).toBeDefined();
    });

    it('should have status default PENDING', () => {
      const status = getColumnByProperty(NotificationRecipient, 'status');
      expect(status?.options?.default).toBe('PENDING');
    });

    it('should be immutable (CreateDateColumn only, no UpdateDateColumn)', () => {
      const cols = getColumnsFor(NotificationRecipient);
      const createDate = cols.find((c) => c.mode === 'createDate');
      const updateDate = cols.find((c) => c.mode === 'updateDate');
      expect(createDate).toBeDefined();
      expect(updateDate).toBeUndefined();
    });
  });
});
