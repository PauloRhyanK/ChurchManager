import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateAsaasCredentialsDto {
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(255)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(255)
  webhookToken?: string;
}

