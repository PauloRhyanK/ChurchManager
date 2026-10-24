import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class ProjectionTopicDto {
  /** Ausente em tópico novo: o servidor gera. */
  @IsOptional()
  @IsUUID('all', { message: 'id do tópico inválido' })
  id?: string;

  @IsString()
  @IsNotEmpty({ message: 'O tópico precisa de um título' })
  @MaxLength(40, { message: 'Título do tópico com até 40 caracteres' })
  title!: string;

  @IsString()
  @IsNotEmpty({ message: 'O tópico precisa de uma frase' })
  @MaxLength(55, { message: 'Frase do tópico com até 55 caracteres' })
  text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80, { message: 'Chamada do tópico com até 80 caracteres' })
  callToAction?: string | null;

  @IsBoolean()
  active!: boolean;
}

export class UpdateProjectionSettingsDto {
  @IsArray({ message: 'hiddenEventIds deve ser uma lista' })
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true, message: 'hiddenEventIds deve conter ids válidos' })
  hiddenEventIds!: string[];

  @IsArray({ message: 'hiddenScheduleIds deve ser uma lista' })
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true, message: 'hiddenScheduleIds deve conter ids válidos' })
  hiddenScheduleIds!: string[];

  /** Ausente = mantém os tópicos guardados. A ordem da lista é a ordem no telão. */
  @IsOptional()
  @IsArray({ message: 'topics deve ser uma lista' })
  @ArrayMaxSize(20, { message: 'No máximo 20 tópicos' })
  @ValidateNested({ each: true })
  @Type(() => ProjectionTopicDto)
  topics?: ProjectionTopicDto[];
}
