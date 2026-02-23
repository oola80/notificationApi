import { IsObject, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class TestMappingDto {
  @IsObject()
  @IsNotEmpty()
  samplePayload: Record<string, any>;

  @IsString()
  @IsOptional()
  cycleId?: string;

  @IsString()
  @IsOptional()
  eventType?: string;
}
