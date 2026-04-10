import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateAsaasCredentialsDto {
  @IsString()
  @MinLength(10)
  @MaxLength(255)
  apiKey!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(255)
  webhookToken!: string;
}

