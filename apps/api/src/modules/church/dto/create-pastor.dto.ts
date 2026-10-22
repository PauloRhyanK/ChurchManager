import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { RequiredText, StrictBoolean, IsHttpUrl } from './field-decorators';

export class CreatePastorDto {
  @RequiredText()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @IsHttpUrl()
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
