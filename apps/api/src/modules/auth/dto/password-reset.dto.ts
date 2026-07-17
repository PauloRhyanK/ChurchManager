import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RequestPasswordResetDto {
  @IsEmail()
  @Transform(({ value }) => String(value ?? '').trim().toLowerCase())
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(255)
  password!: string;
}
