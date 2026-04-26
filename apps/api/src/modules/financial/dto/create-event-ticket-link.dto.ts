import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateEventTicketLinkDto {
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => String(value ?? '').trim())
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(({ value }) => String(value ?? '').trim().toLowerCase())
  presetKey?: string;
}
