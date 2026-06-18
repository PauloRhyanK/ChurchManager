import { Transform } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export const EVENT_FIELD_TYPES = [
  'TEXT',
  'EMAIL',
  'PHONE',
  'CPF',
  'TEXTAREA',
  'SELECT',
  'CHECKBOX',
] as const;

export class CreateEventFieldDefinitionDto {
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => String(value ?? '').trim())
  label!: string;

  @IsIn(EVENT_FIELD_TYPES)
  type!: (typeof EVENT_FIELD_TYPES)[number];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  options?: string[];
}

export class UpdateEventFieldDefinitionDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => String(value ?? '').trim())
  label?: string;

  @IsOptional()
  @IsIn(EVENT_FIELD_TYPES)
  type?: (typeof EVENT_FIELD_TYPES)[number];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  options?: string[];
}
