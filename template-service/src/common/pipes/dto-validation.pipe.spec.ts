import { DtoValidationPipe } from './dto-validation.pipe.js';
import { IsString, IsNotEmpty } from 'class-validator';
import { HttpException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';

class TestDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}

describe('DtoValidationPipe', () => {
  let pipe: DtoValidationPipe;

  beforeEach(() => {
    pipe = new DtoValidationPipe();
  });

  it('should pass valid DTOs through', async () => {
    const dto = plainToInstance(TestDto, { name: 'test' });
    const result = await pipe.transform(dto, {
      type: 'body',
      metatype: TestDto,
    });
    expect(result.name).toBe('test');
  });

  it('should throw TS-001 for missing required fields', async () => {
    const dto = plainToInstance(TestDto, {});
    await expect(
      pipe.transform(dto, { type: 'body', metatype: TestDto }),
    ).rejects.toThrow(HttpException);

    try {
      await pipe.transform(dto, { type: 'body', metatype: TestDto });
    } catch (error) {
      const response = (error as HttpException).getResponse() as any;
      expect(response.code).toBe('TS-001');
      expect(response.details).toBe('INVALID_REQUEST_BODY');
    }
  });

  it('should reject non-whitelisted properties', async () => {
    const dto = plainToInstance(TestDto, {
      name: 'test',
      extraField: 'not allowed',
    });
    await expect(
      pipe.transform(dto, { type: 'body', metatype: TestDto }),
    ).rejects.toThrow(HttpException);
  });
});
