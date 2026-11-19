import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { RequiredText } from '../../church/dto/field-decorators';

export const MOMENT_KINDS = ['PRE_SERVICE', 'GENERIC', 'WORSHIP'] as const;
export type MomentKind = (typeof MOMENT_KINDS)[number];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateServiceDto {
  @Matches(DATE_RE, { message: 'date deve estar no formato AAAA-MM-DD' })
  date!: string;

  @IsOptional()
  @Matches(TIME_RE, { message: 'startTime deve estar no formato HH:MM' })
  startTime?: string;

  @IsOptional()
  @IsUUID()
  templateId?: string;
}

export class UpdateServiceDto {
  @IsOptional()
  @Matches(DATE_RE, { message: 'date deve estar no formato AAAA-MM-DD' })
  date?: string;

  @IsOptional()
  @Matches(TIME_RE, { message: 'startTime deve estar no formato HH:MM' })
  startTime?: string;

  @RequiredText({ partial: true })
  @MaxLength(120)
  name?: string;
}

export class MomentDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @RequiredText()
  @MaxLength(120)
  name!: string;

  @IsIn(MOMENT_KINDS, { message: 'tipo de momento inválido' })
  kind!: MomentKind;

  @IsInt()
  @Min(1)
  @Max(600)
  durationMinutes!: number;
}

export class SetMomentsDto {
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => MomentDto)
  moments!: MomentDto[];
}

export class SetSongsDto {
  @IsArray()
  @ArrayMaxSize(60)
  @IsUUID('all', { each: true })
  songIds!: string[];
}

export class CreateTemplateDto {
  @RequiredText()
  @MaxLength(120)
  name!: string;

  @IsUUID()
  fromServiceId!: string;
}
