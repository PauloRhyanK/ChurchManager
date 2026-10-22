import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { RequiredText, StrictBoolean, IsImageRef } from './field-decorators';

export class UpdatePastorDto {
  @RequiredText({ partial: true })
  @MaxLength(255)
  name?: string;

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
  @StrictBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
