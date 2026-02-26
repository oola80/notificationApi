import { VariableDetectorService } from './variable-detector.service.js';

describe('VariableDetectorService', () => {
  let service: VariableDetectorService;

  beforeEach(() => {
    service = new VariableDetectorService();
  });

  describe('detectVariables', () => {
    it('should detect simple variables', () => {
      const result = service.detectVariables([
        { body: 'Hello {{name}}, your order {{orderId}} is ready.' },
      ]);
      expect(result).toEqual(['name', 'orderId']);
    });

    it('should detect nested path variables', () => {
      const result = service.detectVariables([
        { body: 'Order: {{order.id}}, Customer: {{customer.name}}' },
      ]);
      expect(result).toEqual(['customer.name', 'order.id']);
    });

    it('should detect variables in #if blocks', () => {
      const result = service.detectVariables([
        { body: '{{#if hasTracking}}Tracking: {{trackingNumber}}{{/if}}' },
      ]);
      expect(result).toEqual(['hasTracking', 'trackingNumber']);
    });

    it('should detect variables in #each blocks', () => {
      const result = service.detectVariables([
        { body: '{{#each items}}{{name}} - {{price}}{{/each}}' },
      ]);
      expect(result).toEqual(['items', 'name', 'price']);
    });

    it('should detect variables in #unless blocks', () => {
      const result = service.detectVariables([
        {
          body: '{{#unless optedOut}}You will receive notifications{{/unless}}',
        },
      ]);
      expect(result).toEqual(['optedOut']);
    });

    it('should detect variables from subject and body', () => {
      const result = service.detectVariables([
        { subject: 'Order {{orderId}}', body: 'Hello {{customerName}}' },
      ]);
      expect(result).toEqual(['customerName', 'orderId']);
    });

    it('should deduplicate variables across channels', () => {
      const result = service.detectVariables([
        { subject: 'Hi {{name}}', body: 'Hello {{name}}, order {{orderId}}' },
        { body: 'SMS: {{name}} - {{orderId}}' },
      ]);
      expect(result).toEqual(['name', 'orderId']);
    });

    it('should exclude built-in helpers used as mustache statements', () => {
      const result = service.detectVariables([
        {
          body: '{{formatCurrency amount}} {{formatDate date}} {{uppercase text}}',
        },
      ]);
      // formatCurrency, formatDate, uppercase are helpers — their params are variables
      expect(result).toEqual(['amount', 'date', 'text']);
    });

    it('should exclude @data variables', () => {
      const result = service.detectVariables([
        { body: '{{#each items}}{{@index}}: {{name}}{{/each}}' },
      ]);
      expect(result).toContain('items');
      expect(result).toContain('name');
      expect(result).not.toContain('@index');
    });

    it('should exclude this keyword', () => {
      const result = service.detectVariables([
        { body: '{{#each items}}{{this}}{{/each}}' },
      ]);
      expect(result).toEqual(['items']);
    });

    it('should return empty array for plain text', () => {
      const result = service.detectVariables([
        { body: 'Hello world, no variables here.' },
      ]);
      expect(result).toEqual([]);
    });

    it('should return sorted results', () => {
      const result = service.detectVariables([
        { body: '{{zebra}} {{apple}} {{mango}}' },
      ]);
      expect(result).toEqual(['apple', 'mango', 'zebra']);
    });

    it('should handle empty channels array', () => {
      const result = service.detectVariables([]);
      expect(result).toEqual([]);
    });

    it('should handle variables in else blocks', () => {
      const result = service.detectVariables([
        {
          body: '{{#if premium}}VIP: {{vipMessage}}{{else}}Standard: {{standardMessage}}{{/if}}',
        },
      ]);
      expect(result).toContain('premium');
      expect(result).toContain('vipMessage');
      expect(result).toContain('standardMessage');
    });

    it('should exclude lowercase helper', () => {
      const result = service.detectVariables([
        { body: '{{lowercase name}}' },
      ]);
      expect(result).toEqual(['name']);
      expect(result).not.toContain('lowercase');
    });

    it('should exclude truncate helper', () => {
      const result = service.detectVariables([
        { body: '{{truncate description}}' },
      ]);
      expect(result).toEqual(['description']);
    });

    it('should exclude eq helper', () => {
      const result = service.detectVariables([
        { body: '{{eq status}}' },
      ]);
      expect(result).toEqual(['status']);
    });

    it('should exclude gt helper', () => {
      const result = service.detectVariables([
        { body: '{{gt amount}}' },
      ]);
      expect(result).toEqual(['amount']);
    });

    it('should exclude default helper', () => {
      const result = service.detectVariables([
        { body: '{{default value}}' },
      ]);
      expect(result).toEqual(['value']);
    });

    it('should detect variables in #with blocks', () => {
      const result = service.detectVariables([
        { body: '{{#with order}}{{id}} - {{total}}{{/with}}' },
      ]);
      expect(result).toContain('order');
      expect(result).toContain('id');
      expect(result).toContain('total');
    });

    it('should exclude lookup helper', () => {
      const result = service.detectVariables([
        { body: '{{lookup items index}}' },
      ]);
      expect(result).toEqual(['index', 'items']);
      expect(result).not.toContain('lookup');
    });

    it('should exclude log helper', () => {
      const result = service.detectVariables([
        { body: '{{log message}}' },
      ]);
      expect(result).toEqual(['message']);
      expect(result).not.toContain('log');
    });
  });
});
