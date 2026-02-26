import {
  EXCHANGE_NOTIFICATIONS_STATUS,
  templateRoutingKey,
  renderRoutingKey,
} from './rabbitmq.constants.js';

describe('RabbitMQ Constants', () => {
  it('should define the status exchange', () => {
    expect(EXCHANGE_NOTIFICATIONS_STATUS).toBe('xch.notifications.status');
  });

  describe('templateRoutingKey', () => {
    it('should build template action routing key', () => {
      expect(templateRoutingKey('created')).toBe('template.template.created');
      expect(templateRoutingKey('updated')).toBe('template.template.updated');
      expect(templateRoutingKey('deleted')).toBe('template.template.deleted');
      expect(templateRoutingKey('rolledback')).toBe('template.template.rolledback');
    });
  });

  describe('renderRoutingKey', () => {
    it('should build render status routing key', () => {
      expect(renderRoutingKey('completed')).toBe('template.render.completed');
      expect(renderRoutingKey('failed')).toBe('template.render.failed');
    });
  });
});
