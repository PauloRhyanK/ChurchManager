import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateEventCouponDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'Código deve conter apenas letras, números, hífen ou sublinhado',
  })
  @Transform(({ value }) =>
    value !== undefined ? String(value ?? '').trim().toUpperCase() : undefined,
  )
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => {
    if (value === undefined) return undefined;
    const s = String(value ?? '').trim();
    return s === '' ? null : s;
  })
  name?: string | null;

  @IsOptional()
  @IsIn(['PERCENTAGE', 'FIXED'])
  discountType?: 'PERCENTAGE' | 'FIXED';

  @IsOptional()
  @IsInt()
  @Min(1)
  discountValue?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) =>
    value === null || value === '' || value === undefined
      ? null
      : Number(value),
  )
  maxUses?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) =>
    value === null || value === '' || value === undefined ? 1 : Number(value),
  )
  maxUsesPerCpf?: number;

  @IsOptional()
  @IsDateString()
  @Transform(({ value }) =>
    value === null || value === '' || value === undefined
      ? null
      : String(value),
  )
  validFrom?: string | null;

  @IsOptional()
  @IsDateString()
  @Transform(({ value }) =>
    value === null || value === '' || value === undefined
      ? null
      : String(value),
  )
  validUntil?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  ticketTypeIds?: string[];
}
