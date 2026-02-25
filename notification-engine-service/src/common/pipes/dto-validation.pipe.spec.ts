import { DtoValidationPipe } from './dto-validation.pipe.js';
import { HttpException } from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import { ArgumentMetadata } from '@nestjs/common';

class TestDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

describe('DtoValidationPipe', () => {
  let pipe: DtoValidationPipe;

  beforeEach(() => {
    pipe = new DtoValidationPipe();
  });

  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: TestDto,
  };

  it('should pass valid DTOs through', async () => {
    const result = await pipe.transform({ name: 'test' }, metadata);
    expect(result).toEqual({ name: 'test' });
  });

  it('should throw HttpException with NES-001 for missing required fields', async () => {
    await expect(pipe.transform({}, metadata)).rejects.toThrow(HttpException);

    try {
      await pipe.transform({}, metadata);
    } catch (error) {
      const response = (error as HttpException).getResponse() as any;
      expect(response.code).toBe('NES-001');
      expect(response.details).toBe('INVALID_REQUEST_BODY');
    }
  });

  it('should reject non-whitelisted properties with NES-001 error', async () => {
    try {
      await pipe.transform({ name: 'test', unknown: 'value' }, metadata);
      fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      const response = (error as HttpException).getResponse() as any;
      expect(response.code).toBe('NES-001');
      expect(response.message).toContain('unknown');
    }
  });
});
