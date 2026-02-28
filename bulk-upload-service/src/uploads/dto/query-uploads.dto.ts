import {
  IsOptional,
  IsEnum,
  IsUUID,
  IsDateString,
  IsInt,
  Min,
  Max,
  IsIn,
} from 'class-validator';
import { UploadStatus } from '../entities/upload.entity.js';

export class QueryUploadsDto {
  @IsOptional()
  @IsEnum(UploadStatus)
  status?: UploadStatus;

  @IsOptional()
  @IsUUID()
  uploadedBy?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsIn(['createdAt', 'fileName', 'totalRows', 'status'])
  sortBy?: string = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: string = 'desc';
}
