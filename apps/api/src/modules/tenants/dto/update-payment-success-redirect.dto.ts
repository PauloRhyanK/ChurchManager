import { Transform } from 'class-transformer';
import { IsOptional, IsUrl, MaxLength, ValidateIf } from 'class-validator';

export class UpdatePaymentSuccessRedirectDto {
  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === null ? null : value,
  )
  @ValidateIf(
    (o: UpdatePaymentSuccessRedirectDto) =>
      o.paymentSuccessRedirectUrl != null &&
      String(o.paymentSuccessRedirectUrl).trim() !== '',
  )
  @IsUrl(
    {
      require_protocol: true,
      protocols: ['http', 'https'],
      require_tld: false,
    },
    { message: 'paymentSuccessRedirectUrl deve ser uma URL http(s) válida' },
  )
  @MaxLength(2048)
  paymentSuccessRedirectUrl?: string | null;
}
