import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { SCHEDULE_DAYS } from './create-schedule.dto';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export class UpdateScheduleDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => String(value ?? '').trim())
  title?: string;

  @IsOptional()
  @IsIn([...SCHEDULE_DAYS])
  dayOfWeek?: (typeof SCHEDULE_DAYS)[number];

  @IsOptional()
  @Matches(TIME_RE, { message: 'timeStart deve ser HH:MM ou HH:MM:SS' })
  timeStart?: string;

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
  @MaxLength(5000)
  @Transform(({ value }) => {
    const s = String(value ?? '').trim();
    return s === '' ? null : s;
  })
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
