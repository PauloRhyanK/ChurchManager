import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class PublicSignupDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  @Transform(({ value }) => String(value ?? '').trim())
  name!: string;

  @IsEmail()
  @Transform(({ value }) => String(value ?? '').trim().toLowerCase())
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(255)
  password!: string;
}

export class AcceptInvitationDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) =>
    value == null ? value : String(value).trim() || null,
  )
  name?: string | null;

  @IsString()
  @MinLength(8)
  @MaxLength(255)
  password!: string;
}
