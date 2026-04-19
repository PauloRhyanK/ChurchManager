import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsInt,
  IsNumber,
  IsOptional,
  IsUrl,
  Max,
  MaxLength,
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

  /**
   * URL após pagamento concluído (Asaas `callback.successUrl`). O origin deve estar
   * em `tenant_public_web_origins` e o domínio também nos dados comerciais Asaas.
   */
  @IsOptional()
  @IsUrl(
    {
      require_protocol: true,
      protocols: ['http', 'https'],
      require_tld: false,
    },
    { message: 'successUrl deve ser uma URL http(s) válida' },
  )
  @MaxLength(2048)
  successUrl?: string;

  /** Só com `successUrl`. Se `false`, o Asaas mostra “Ir para o site” em vez de redireccionar já. */
  @ValidateIf(
    (o: CreatePublicPaymentLinkDto) =>
      o.successUrl != null && String(o.successUrl).trim() !== '',
  )
  @IsOptional()
  @IsBoolean()
  autoRedirect?: boolean;

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
