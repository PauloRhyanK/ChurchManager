import { AdminUserStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class InviteUserDto {
  @IsEmail()
  @Transform(({ value }) => String(value ?? '').trim().toLowerCase())
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) =>
    value == null ? value : String(value).trim() || null,
  )
  name?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @IsUUID('all', { each: true })
  groupIds?: string[];
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) =>
    value == null ? value : String(value).trim() || null,
  )
  name?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @IsUUID('all', { each: true })
  groupIds?: string[];

  /** Apenas transições operacionais permitidas via edição. */
  @IsOptional()
  @IsIn([AdminUserStatus.ACTIVE, AdminUserStatus.SUSPENDED])
  status?: typeof AdminUserStatus.ACTIVE | typeof AdminUserStatus.SUSPENDED;
}
