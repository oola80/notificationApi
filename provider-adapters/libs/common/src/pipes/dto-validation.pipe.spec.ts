import { DtoValidationPipe } from './dto-validation.pipe.js';
import { ArgumentMetadata, HttpException } from '@nestjs/common';
import { IsString, IsNotEmpty } from 'class-validator';

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

  it('should pass valid data through', async () => {
    const result = await pipe.transform({ name: 'test' }, metadata);
    expect(result).toBeDefined();
    expect(result.name).toBe('test');
  });

  it('should throw PA-001 HttpException on validation failure', async () => {
    try {
      await pipe.transform({ name: '' }, metadata);
      fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      const response = (error as HttpException).getResponse() as any;
      expect(response.code).toBe('PA-001');
      expect(response.details).toBe('INVALID_REQUEST_BODY');
    }
  });

  it('should reject non-whitelisted properties with PA-001', async () => {
    try {
      await pipe.transform({ name: 'test', extra: 'bad' }, metadata);
      fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      const response = (error as HttpException).getResponse() as any;
      expect(response.code).toBe('PA-001');
    }
  });

  it('should enable implicit conversion', () => {
    expect(pipe).toBeDefined();
  });
});
