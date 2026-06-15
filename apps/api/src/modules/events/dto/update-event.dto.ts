import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export class UpdateEventDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => String(value ?? '').trim())
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  @Transform(({ value }) => {
    const s = String(value ?? '').trim();
    return s === '' ? null : s;
  })
  description?: string | null;

  @IsOptional()
  @IsString()
  @Matches(DATE_RE, { message: 'date deve ser YYYY-MM-DD' })
  date?: string;

  @IsOptional()
  @Matches(TIME_RE, { message: 'timeStart deve ser HH:MM ou HH:MM:SS' })
  timeStart?: string;

  @IsOptional()
  @Matches(TIME_RE, { message: 'timeEnd deve ser HH:MM ou HH:MM:SS' })
  timeEnd?: string;

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
  @MaxLength(2048)
  @Transform(({ value }) => {
    const s = String(value ?? '').trim();
    return s === '' ? null : s;
  })
  imageUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => {
    const s = String(value ?? '').trim();
    return s === '' ? null : s;
  })
  tag?: string | null;

  @IsOptional()
  @IsBoolean()
  published?: boolean;
}
