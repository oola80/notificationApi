import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class RegisterProviderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  providerName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  providerId: string;

  @IsIn(['email', 'sms', 'whatsapp', 'push'])
  channel: string;

  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  adapterUrl: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;

  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  routingWeight?: number = 100;

  @IsInt()
  @Min(1)
  @IsOptional()
  rateLimitTokensPerSec?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  rateLimitMaxBurst?: number;
}
