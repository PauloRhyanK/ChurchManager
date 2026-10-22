import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { RequiredText, StrictBoolean, IsHttpUrl, IsImageRef } from './field-decorators';

export class UpdateBranchDto {
  @RequiredText({ partial: true })
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => {
    const s = String(value ?? '').trim();
    return s === '' ? null : s;
  })
  location?: string | null;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    const s = String(value ?? '').trim();
    return s === '' ? null : s;
  })
  address?: string | null;

  @IsOptional()
  @IsString()
  @IsImageRef()
  @MaxLength(512)
  @Transform(({ value }) => {
    const s = String(value ?? '').trim();
    return s === '' ? null : s;
  })
  image?: string | null;

  @IsOptional()
  @IsString()
  @IsHttpUrl()
  @MaxLength(2048)
  @Transform(({ value }) => {
    const s = String(value ?? '').trim();
    return s === '' ? null : s;
  })
  mapsUrl?: string | null;

  @IsOptional()
  @StrictBoolean()
  isHeadquarters?: boolean;

  @IsOptional()
  @StrictBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
