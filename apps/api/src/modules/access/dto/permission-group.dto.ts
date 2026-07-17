import { PermissionLevel, PermissionModule } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class PermissionEntryDto {
  @IsEnum(PermissionModule)
  module!: PermissionModule;

  @IsEnum(PermissionLevel)
  level!: PermissionLevel;
}

export class CreatePermissionGroupDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  @Transform(({ value }) => String(value ?? '').trim())
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }) =>
    value == null ? value : String(value).trim() || null,
  )
  description?: string | null;

  @IsArray()
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => PermissionEntryDto)
  entries!: PermissionEntryDto[];
}

export class UpdatePermissionGroupDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  @Transform(({ value }) => (value == null ? value : String(value).trim()))
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }) =>
    value == null ? value : String(value).trim() || null,
  )
  description?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => PermissionEntryDto)
  entries?: PermissionEntryDto[];
}
