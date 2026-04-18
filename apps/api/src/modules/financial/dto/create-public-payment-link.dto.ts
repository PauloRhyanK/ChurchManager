import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

/** Body do endpoint público de links para **cotas**. */
export class CreatePublicPaymentLinkDto {
  @IsOptional()
  @Transform(({ value }) => (value === null ? undefined : value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  value?: number;

  @IsBoolean()
  isMonthly!: boolean;

  /** Obrigatório com `isMonthly: true` — duração da assinatura em meses (enviado à Asaas como `endDate`). */
  @ValidateIf((o: CreatePublicPaymentLinkDto) => o.isMonthly === true)
  @IsDefined({
    message:
      'subscriptionDurationMonths é obrigatório quando isMonthly é true',
  })
  @IsInt()
  @Min(1)
  @Max(120)
  subscriptionDurationMonths?: number;
}
