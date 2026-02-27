import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';

export class UpdateChannelConfigDto {
  @IsIn(['primary', 'weighted', 'failover'])
  @IsOptional()
  routingMode?: string;

  @IsUUID('all')
  @IsOptional()
  activeProviderId?: string;

  @IsUUID('all')
  @IsOptional()
  fallbackChannelId?: string | null;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
