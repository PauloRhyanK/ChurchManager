import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { TicketFieldConfigDto } from './ticket-field-config.dto';

export const ALLOWED_BILLING_TYPES = [
  'PIX',
  'BOLETO',
  'CREDIT_CARD',
  'UNDEFINED',
] as const;

export class CreateEventTicketTypeDto {
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => String(value ?? '').trim())
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @Transform(({ value }) => {
    const s = String(value ?? '').trim();
    return s === '' ? null : s;
  })
  description?: string | null;

  @IsInt()
  @Min(0)
  priceCents!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  feeCents?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantityTotal?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  minPerOrder?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxPerOrder?: number;

  @IsOptional()
  salesOpensAt?: string;

  @IsOptional()
  salesClosesAt?: string;

  @IsOptional()
  @IsIn(['PUBLIC', 'PRIVATE'])
  visibility?: 'PUBLIC' | 'PRIVATE';

  @IsOptional()
  @IsBoolean()
  allowGuestRegistration?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Transform(({ value }) => {
    const s = String(value ?? '').trim();
    return s === '' ? null : s;
  })
  communityLink?: string | null;

  @IsOptional()
  @IsArray()
  @IsIn(ALLOWED_BILLING_TYPES, { each: true })
  allowedBillingTypes?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  maxInstallments?: number | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TicketFieldConfigDto)
  fieldConfigs?: TicketFieldConfigDto[];
}
