import { IsBoolean, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

/** Configuração de um campo de inscrição num tipo de ingresso. */
export class TicketFieldConfigDto {
  @IsUUID()
  fieldId!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
