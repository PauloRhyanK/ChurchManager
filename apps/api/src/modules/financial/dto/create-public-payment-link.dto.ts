import { Transform } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

/** Body do endpoint público de links para **cotas**. */
export class CreatePublicPaymentLinkDto {
  @IsOptional()
  @Transform(({ value }) => (value === null ? undefined : value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  value?: number;

  @IsBoolean()
  isMonthly!: boolean;
}
