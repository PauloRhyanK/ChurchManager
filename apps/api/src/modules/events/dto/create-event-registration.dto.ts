import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { EventFieldValueDto } from './create-event-checkout.dto';

export class CreateEventRegistrationDto {
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => String(value ?? '').trim())
  name!: string;

  @IsEmail()
  @MaxLength(255)
  @Transform(({ value }) => String(value ?? '').trim().toLowerCase())
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => {
    const s = String(value ?? '').trim();
    return s === '' ? null : s;
  })
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @Transform(({ value }) => {
    const s = String(value ?? '').trim();
    return s === '' ? null : s;
  })
  message?: string | null;

  @IsOptional()
  @IsUUID()
  userId?: string | null;

  @IsOptional()
  @IsUUID()
  ticketTypeId?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EventFieldValueDto)
  fieldValues?: EventFieldValueDto[];
}
