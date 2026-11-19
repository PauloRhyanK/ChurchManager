import { IsBoolean, IsOptional, IsUUID, Matches } from 'class-validator';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Um culto (serviceId) OU uma data e hora (date + startTime); a regra do par fica no serviço. */
export class SendSermonDto {
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @IsOptional()
  @Matches(DATE_RE, { message: 'date deve estar no formato AAAA-MM-DD' })
  date?: string;

  @IsOptional()
  @Matches(TIME_RE, { message: 'startTime deve estar no formato HH:MM' })
  startTime?: string;

  @IsOptional()
  @IsBoolean()
  replace?: boolean;
}

export class DeliveryPreviewQuery {
  @Matches(DATE_RE, { message: 'date deve estar no formato AAAA-MM-DD' })
  date!: string;

  @Matches(TIME_RE, { message: 'startTime deve estar no formato HH:MM' })
  startTime!: string;
}
