import { Test, TestingModule } from '@nestjs/testing';
import { RecipientResolverService } from './recipient-resolver.service.js';
import { RecipientGroupsRepository } from './recipient-groups.repository.js';
import { HttpException } from '@nestjs/common';

describe('RecipientResolverService', () => {
  let service: RecipientResolverService;
  let repository: RecipientGroupsRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecipientResolverService,
        {
          provide: RecipientGroupsRepository,
          useValue: {
            findActiveMembers: jest.fn().mockResolvedValue([
              {
                id: 1,
                email: 'member@test.com',
                phone: '+1234',
                deviceToken: null,
                memberName: 'John',
                isActive: true,
              },
            ]),
            findById: jest
              .fn()
              .mockResolvedValue({ id: 'group-id', isActive: true }),
          },
        },
      ],
    }).compile();

    service = module.get<RecipientResolverService>(RecipientResolverService);
    repository = module.get<RecipientGroupsRepository>(
      RecipientGroupsRepository,
    );
  });

  describe('customer type', () => {
    it('should extract customer fields from event payload', async () => {
      const result = await service.resolveRecipients(
        { recipientType: 'customer' },
        {
          customerEmail: 'cust@test.com',
          customerPhone: '+5678',
          deviceToken: 'tok123',
          customerId: 'C001',
          customerName: 'Jane',
        },
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        email: 'cust@test.com',
        phone: '+5678',
        deviceToken: 'tok123',
        customerId: 'C001',
        name: 'Jane',
      });
    });

    it('should handle missing customer fields', async () => {
      const result = await service.resolveRecipients(
        { recipientType: 'customer' },
        { someOtherField: 'value' },
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({});
    });

    it('should include only present fields', async () => {
      const result = await service.resolveRecipients(
        { recipientType: 'customer' },
        { customerEmail: 'only@email.com' },
      );
      expect(result[0]).toEqual({ email: 'only@email.com' });
    });
  });

  describe('group type', () => {
    it('should return active group members', async () => {
      const result = await service.resolveRecipients(
        { recipientType: 'group', recipientGroupId: 'group-id' },
        {},
      );
      expect(repository.findActiveMembers).toHaveBeenCalledWith('group-id');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          email: 'member@test.com',
          phone: '+1234',
          name: 'John',
        }),
      );
    });

    it('should throw NES-004 for inactive group', async () => {
      jest.spyOn(repository, 'findActiveMembers').mockResolvedValue([]);
      jest
        .spyOn(repository, 'findById')
        .mockResolvedValue({ id: 'group-id', isActive: false } as any);
      try {
        await service.resolveRecipients(
          { recipientType: 'group', recipientGroupId: 'group-id' },
          {},
        );
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect((e as HttpException).getResponse()).toEqual(
          expect.objectContaining({ code: 'NES-004' }),
        );
      }
    });

    it('should throw NES-004 when group not found', async () => {
      jest.spyOn(repository, 'findActiveMembers').mockResolvedValue([]);
      jest.spyOn(repository, 'findById').mockResolvedValue(null);
      try {
        await service.resolveRecipients(
          { recipientType: 'group', recipientGroupId: 'group-id' },
          {},
        );
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect((e as HttpException).getResponse()).toEqual(
          expect.objectContaining({ code: 'NES-004' }),
        );
      }
    });

    it('should throw NES-004 when no groupId provided', async () => {
      try {
        await service.resolveRecipients({ recipientType: 'group' }, {});
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect((e as HttpException).getResponse()).toEqual(
          expect.objectContaining({ code: 'NES-004' }),
        );
      }
    });
  });

  describe('custom type', () => {
    it('should map custom recipients to ResolvedRecipient[]', async () => {
      const result = await service.resolveRecipients(
        {
          recipientType: 'custom',
          customRecipients: [
            { email: 'custom@test.com', phone: '+999', name: 'Custom User' },
          ],
        },
        {},
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          email: 'custom@test.com',
          name: 'Custom User',
        }),
      );
    });

    it('should return empty array when no custom recipients', async () => {
      const result = await service.resolveRecipients(
        { recipientType: 'custom', customRecipients: [] },
        {},
      );
      expect(result).toEqual([]);
    });

    it('should return empty array when customRecipients undefined', async () => {
      const result = await service.resolveRecipients(
        { recipientType: 'custom' },
        {},
      );
      expect(result).toEqual([]);
    });
  });

  describe('unknown type', () => {
    it('should return empty array for unknown recipient type', async () => {
      const result = await service.resolveRecipients(
        { recipientType: 'unknown' },
        {},
      );
      expect(result).toEqual([]);
    });
  });
});
