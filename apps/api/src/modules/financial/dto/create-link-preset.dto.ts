import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  FINANCIAL_LINK_MODULES,
  type FinancialLinkModule,
} from '../payment-links-reuse.types';

export class CreateLinkPresetDto {
  @IsIn(FINANCIAL_LINK_MODULES)
  module!: FinancialLinkModule;

  @IsString()
  @MaxLength(80)
  @Transform(({ value }) => String(value ?? '').trim().toLowerCase())
  presetKey!: string;

  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => String(value ?? '').trim())
  name!: string;

  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => String(value ?? '').trim())
  sourceKey!: string;

  @IsBoolean()
  isMonthly!: boolean;

  @ValidateIf((o: CreateLinkPresetDto) => o.isMonthly === true)
  @IsDefined({
    message:
      'subscriptionDurationMonths é obrigatório quando isMonthly é true',
  })
  @IsInt()
  @Min(1)
  @Max(120)
  subscriptionDurationMonths?: number;

  @IsOptional()
  @Transform(({ value }) => (value === null ? undefined : value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(5)
  value?: number;

  @IsOptional()
  @IsUrl({
    require_protocol: true,
    protocols: ['http', 'https'],
    require_tld: false,
  })
  @MaxLength(2048)
  successUrl?: string;

  @ValidateIf(
    (o: CreateLinkPresetDto) =>
      o.successUrl != null && String(o.successUrl).trim() !== '',
  )
  @IsOptional()
  @IsBoolean()
  autoRedirect?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
