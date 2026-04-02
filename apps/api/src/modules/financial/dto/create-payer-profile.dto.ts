import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IsCpf } from '../../../common/is-cpf.validator';

export class CreatePayerProfileDto {
  @IsCpf()
  cpf!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}
