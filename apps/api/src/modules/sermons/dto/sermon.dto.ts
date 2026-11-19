import { IsInt, IsObject, IsOptional, MaxLength, Min } from 'class-validator';
import { RequiredText } from '../../church/dto/field-decorators';

export class CreateSermonDto {
  @RequiredText({ partial: true })
  @MaxLength(255)
  title?: string;
}

export class UpdateSermonDto {
  @RequiredText({ partial: true })
  @MaxLength(255)
  title?: string;

  /** A árvore é validada no serviço por `validateSermonDocument`. */
  @IsOptional()
  @IsObject()
  document?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  baseRevision?: number;
}
