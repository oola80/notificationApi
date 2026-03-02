import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  SendRequestDto,
  RecipientDto,
  ContentDto,
  MediaDto,
  MetadataDto,
  TemplateParameterDto,
  ChannelType,
} from './send-request.dto.js';

describe('SendRequestDto', () => {
  function createValidDto(): Record<string, any> {
    return {
      channel: 'email',
      recipient: { address: 'user@example.com', name: 'Test User' },
      content: { body: 'Hello world', subject: 'Test' },
      metadata: { notificationId: '123e4567-e89b-12d3-a456-426614174000' },
    };
  }

  it('should validate a valid SendRequestDto', async () => {
    const dto = plainToInstance(SendRequestDto, createValidDto());
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject invalid channel', async () => {
    const data = createValidDto();
    data.channel = 'carrier_pigeon';
    const dto = plainToInstance(SendRequestDto, data);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject missing recipient', async () => {
    const data = createValidDto();
    delete data.recipient;
    const dto = plainToInstance(SendRequestDto, data);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject missing content body', async () => {
    const data = createValidDto();
    data.content = { subject: 'no body' };
    const dto = plainToInstance(SendRequestDto, data);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject missing metadata notificationId', async () => {
    const data = createValidDto();
    data.metadata = {};
    const dto = plainToInstance(SendRequestDto, data);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should allow optional fields', async () => {
    const data = {
      channel: 'sms',
      recipient: { address: '+50212345678' },
      content: { body: 'SMS text' },
      metadata: { notificationId: 'abc-123' },
    };
    const dto = plainToInstance(SendRequestDto, data);
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});

describe('RecipientDto', () => {
  it('should validate a valid RecipientDto', async () => {
    const dto = plainToInstance(RecipientDto, {
      address: 'user@example.com',
      name: 'Test',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject empty address', async () => {
    const dto = plainToInstance(RecipientDto, { address: '' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('ContentDto', () => {
  it('should validate with body only', async () => {
    const dto = plainToInstance(ContentDto, { body: 'Hello' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should validate with media', async () => {
    const dto = plainToInstance(ContentDto, {
      body: 'Attached',
      media: [{ url: 'https://cdn.example.com/file.pdf', contentType: 'application/pdf' }],
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});

describe('MediaDto', () => {
  it('should validate a valid MediaDto', async () => {
    const dto = plainToInstance(MediaDto, {
      url: 'https://cdn.example.com/image.png',
      contentType: 'image/png',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject missing url', async () => {
    const dto = plainToInstance(MediaDto, { contentType: 'image/png' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('MetadataDto', () => {
  it('should validate with required notificationId', async () => {
    const dto = plainToInstance(MetadataDto, { notificationId: 'test-123' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject missing notificationId', async () => {
    const dto = plainToInstance(MetadataDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('TemplateParameterDto', () => {
  it('should validate a valid TemplateParameterDto', async () => {
    const dto = plainToInstance(TemplateParameterDto, {
      name: 'customer_name',
      value: 'Juan',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject empty name', async () => {
    const dto = plainToInstance(TemplateParameterDto, {
      name: '',
      value: 'Juan',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject empty value', async () => {
    const dto = plainToInstance(TemplateParameterDto, {
      name: 'customer_name',
      value: '',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject missing name', async () => {
    const dto = plainToInstance(TemplateParameterDto, {
      value: 'Juan',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject missing value', async () => {
    const dto = plainToInstance(TemplateParameterDto, {
      name: 'customer_name',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('MetadataDto — templateParameters', () => {
  it('should validate with object-array templateParameters', async () => {
    const dto = plainToInstance(MetadataDto, {
      notificationId: 'test-123',
      templateParameters: [
        { name: 'customer_name', value: 'Juan' },
        { name: 'order_id', value: 'ORD-123' },
      ],
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject string-array templateParameters', async () => {
    const dto = plainToInstance(MetadataDto, {
      notificationId: 'test-123',
      templateParameters: ['Juan', 'ORD-123'],
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should allow omitted templateParameters', async () => {
    const dto = plainToInstance(MetadataDto, {
      notificationId: 'test-123',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});

describe('ChannelType', () => {
  it('should have the expected values', () => {
    expect(ChannelType.EMAIL).toBe('email');
    expect(ChannelType.SMS).toBe('sms');
    expect(ChannelType.WHATSAPP).toBe('whatsapp');
    expect(ChannelType.PUSH).toBe('push');
  });
});
