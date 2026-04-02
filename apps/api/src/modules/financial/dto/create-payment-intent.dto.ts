import {
  IsIn,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';
import { IsCpf } from '../../../common/is-cpf.validator';

export class CreatePaymentIntentDto {
  @IsCpf()
  cpf!: string;

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
