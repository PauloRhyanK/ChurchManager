import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsUrl,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { IsCpf } from '../../../common/is-cpf.validator';

export class CreatePaymentIntentDto {
  @IsCpf()
  cpf!: string;

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

  @ValidateIf(
    (o: CreatePaymentIntentDto) =>
      o.successUrl != null && String(o.successUrl).trim() !== '',
  )
  @IsOptional()
  @IsBoolean()
  autoRedirect?: boolean;

  /** Usar valor do plano na base */
  @IsOptional()
  @IsUUID('4')
  planId?: string;

  /** Valor em reais (ex.: 99.9) quando não há planId */
  @ValidateIf((o: CreatePaymentIntentDto) => !o.planId)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  value?: number;

  @IsIn(['PIX', 'BOLETO', 'UNDEFINED'])
  billingType!: 'PIX' | 'BOLETO' | 'UNDEFINED';
}
