import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { RequiredText, StrictBoolean } from '../../church/dto/field-decorators';
import { SCHEDULE_DAYS } from './create-schedule.dto';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export class UpdateScheduleDto {
  @RequiredText({ partial: true })
  @MaxLength(255)
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
  @StrictBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
