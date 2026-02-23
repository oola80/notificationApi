import { Test, TestingModule } from '@nestjs/testing';
import { EventTypeResolverService } from './event-type-resolver.service.js';

describe('EventTypeResolverService', () => {
  let service: EventTypeResolverService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EventTypeResolverService],
    }).compile();

    service = module.get<EventTypeResolverService>(EventTypeResolverService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return raw type when no mapping provided', () => {
    expect(service.resolve('order.created', null)).toBe('order.created');
  });

  it('should return exact match from mapping', () => {
    const mapping = { 'order/created': 'order.created' };
    expect(service.resolve('order/created', mapping)).toBe('order.created');
  });

  it('should return wildcard match when no exact match', () => {
    const mapping = { '*': 'generic.event' };
    expect(service.resolve('unknown.type', mapping)).toBe('generic.event');
  });

  it('should return raw type when no exact or wildcard match', () => {
    const mapping = { 'order.created': 'order.created' };
    expect(service.resolve('order.updated', mapping)).toBe('order.updated');
  });
});
