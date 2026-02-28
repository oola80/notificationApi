import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateDlqStatusDto {
  @IsIn(['investigated', 'reprocessed', 'discarded'])
  status: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  resolvedBy?: string;
}
