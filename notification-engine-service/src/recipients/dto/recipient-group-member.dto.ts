import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class RecipientGroupMemberDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  email: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  phone?: string;

  @IsString()
  @IsOptional()
  deviceToken?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  memberName?: string;
}
