import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsCpf } from '../../../common/is-cpf.validator';

export class EventCheckoutPayerDto {
  @IsCpf()
  cpf!: string;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;
}

export class EventCheckoutLineDto {
  @IsString()
  ticketTypeId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateEventCheckoutDto {
  @ValidateNested()
  @Type(() => EventCheckoutPayerDto)
  payer!: EventCheckoutPayerDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EventCheckoutLineDto)
  lines!: EventCheckoutLineDto[];

  @IsIn(['PIX', 'BOLETO', 'UNDEFINED'])
  billingType!: 'PIX' | 'BOLETO' | 'UNDEFINED';

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}
