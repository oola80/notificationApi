import { IsBoolean, IsInt, IsOptional, IsUrl, Max, Min } from 'class-validator';

export class UpdateProviderConfigDto {
  @IsUrl({ require_tld: false })
  @IsOptional()
  adapterUrl?: string;

  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  routingWeight?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  rateLimitTokensPerSec?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  rateLimitMaxBurst?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
