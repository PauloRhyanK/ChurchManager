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
import { IsCpf } from '../../../common/is-cpf.validator';
const PUBLIC_LINK_REUSE_MODES = ['preset_global', 'cpf_custom'] as const;
type PublicLinkReuseMode = (typeof PUBLIC_LINK_REUSE_MODES)[number];

/** Body do endpoint público de links para **cotas**. */
export class CreatePublicPaymentLinkDto {
  @IsOptional()
  @IsIn(PUBLIC_LINK_REUSE_MODES)
  reuseMode?: PublicLinkReuseMode;

  @ValidateIf(
    (o: CreatePublicPaymentLinkDto) =>
      (o.reuseMode ?? 'preset_global') === 'preset_global' &&
      o.presetKey != null &&
      String(o.presetKey).trim() !== '',
  )
  @IsString()
  @MaxLength(80)
  @Transform(({ value }) => String(value ?? '').trim().toLowerCase())
  presetKey?: string;

  @ValidateIf(
    (o: CreatePublicPaymentLinkDto) =>
      (o.reuseMode ?? 'preset_global') === 'cpf_custom',
  )
  @IsDefined({ message: 'cpf é obrigatório quando reuseMode é cpf_custom' })
  @IsCpf()
  cpf?: string;

  @ValidateIf(
    (o: CreatePublicPaymentLinkDto) =>
      (o.reuseMode ?? 'preset_global') === 'cpf_custom',
  )
  @IsDefined({ message: 'name é obrigatório quando reuseMode é cpf_custom' })
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => String(value ?? '').trim())
  name?: string;

  @IsOptional()
  @Transform(({ value }) => (value === null ? undefined : value))
  @IsNumber({ maxDecimalPlaces: 2 })
  /** Asaas exige mínimo R$ 5,00 em links/cobranças (erro típico: "O valor mínimo para cobranças é R$ 5,00"). */
  @Min(5, {
    message:
      'value deve ser no mínimo R$ 5,00 quando informado (regra Asaas). Omita value para o pagador definir o valor no link.',
  })
  value?: number;

  @ValidateIf(
    (o: CreatePublicPaymentLinkDto) =>
      (o.reuseMode ?? 'preset_global') === 'cpf_custom' ||
      ((o.reuseMode ?? 'preset_global') === 'preset_global' &&
        (!o.presetKey || String(o.presetKey).trim() === '')),
  )
  @IsDefined({
    message:
      'isMonthly é obrigatório quando reuseMode é cpf_custom ou quando presetKey não é enviado',
  })
  @IsBoolean()
  isMonthly?: boolean;

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
  @ValidateIf(
    (o: CreatePublicPaymentLinkDto) =>
      (((o.reuseMode ?? 'preset_global') === 'cpf_custom' ||
        ((o.reuseMode ?? 'preset_global') === 'preset_global' &&
          (!o.presetKey || String(o.presetKey).trim() === ''))) &&
        o.isMonthly === true),
  )
  @IsDefined({
    message:
      'subscriptionDurationMonths é obrigatório quando isMonthly é true',
  })
  @IsInt()
  @Min(1)
  @Max(120)
  subscriptionDurationMonths?: number;
}
