import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateSignupLinkDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) =>
    value == null ? value : String(value).trim() || null,
  )
  label?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @IsUUID('all', { each: true })
  defaultGroupIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  expiresInDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  maxUses?: number;
}

export class UpdateSignupLinkDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) =>
    value == null ? value : String(value).trim() || null,
  )
  label?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @IsUUID('all', { each: true })
  defaultGroupIds?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
