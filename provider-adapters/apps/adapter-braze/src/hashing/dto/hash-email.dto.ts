import { IsString, IsNotEmpty, IsEmail } from 'class-validator';

export class HashEmailRequestDto {
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  email: string;
}

export class HashEmailResponseDto {
  emailHash: string;
  algo: string;
  algoVersion: string;
  normalizedEmail: string;
}
