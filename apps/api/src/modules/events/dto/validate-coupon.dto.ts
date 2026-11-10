import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ValidateCouponLineDto {
  @IsString()
  ticketTypeId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class ValidateCouponDto {
  @IsString()
  code!: string;

  @IsOptional()
  @IsString()
  cpf?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ValidateCouponLineDto)
  lines!: ValidateCouponLineDto[];
}
