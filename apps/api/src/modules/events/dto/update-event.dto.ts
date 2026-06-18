import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

function nullableTrim({ value }: { value: unknown }): string | null {
  const s = String(value ?? '').trim();
  return s === '' ? null : s;
}

export class UpdateEventDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => String(value ?? '').trim())
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  @Transform(nullableTrim)
  description?: string | null;

  @IsOptional()
  @IsIn(['IN_PERSON', 'ONLINE'])
  format?: 'IN_PERSON' | 'ONLINE';

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Transform(nullableTrim)
  onlineUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(nullableTrim)
  shortDescription?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50000)
  @Transform(nullableTrim)
  detailsHtml?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Transform(nullableTrim)
  videoUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Transform(nullableTrim)
  coverImageUrl?: string | null;

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
  @Transform(nullableTrim)
  location?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Transform(nullableTrim)
  imageUrl?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  published?: boolean;
}
