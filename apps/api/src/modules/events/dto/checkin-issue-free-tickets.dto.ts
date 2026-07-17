import {
  ArrayMinSize,
  IsArray,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/** Emissão gratuita de ingressos no local: um nome por ingresso. */
export class IssueFreeTicketsDto {
  @IsUUID()
  ticketTypeId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  holderNames!: string[];
}
