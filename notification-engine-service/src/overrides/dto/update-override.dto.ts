import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class UpdateOverrideDto {
  @IsString()
  @IsOptional()
  reason?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  updatedBy?: string;
}
