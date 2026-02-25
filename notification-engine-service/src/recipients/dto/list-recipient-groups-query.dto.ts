import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListRecipientGroupsQueryDto {
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  limit?: number = 50;
}
