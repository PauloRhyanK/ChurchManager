import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { RequiredText, StrictBoolean } from '../../church/dto/field-decorators';
import { SLIDE_LIMITS, SLIDE_MODEL_LIMITS } from '../sermon-slides';

const MODES = ['VERSES', 'VERSES_AND_POINTS', 'FULL'] as const;
const STYLES = ['MINIMAL', 'BACKGROUND'] as const;

export class GenerateSlidesDto {
  @IsIn(MODES, { message: 'modo de slides inválido' })
  mode!: (typeof MODES)[number];

  @IsOptional()
  @IsIn(STYLES, { message: 'estilo de slides inválido' })
  style?: (typeof STYLES)[number];

  /** Id de um modelo de GET /sermons/ai; só vale em "Slides completos". */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  model?: string;
}

/** Só o que o pregador decide em cada item; tipo, referência, origem, modelo e título de contexto vêm do que está gravado. */
export class SlideItemInputDto {
  @RequiredText()
  @MaxLength(120)
  id!: string;

  @StrictBoolean()
  included!: boolean;

  @RequiredText({ partial: true })
  @MaxLength(SLIDE_LIMITS.textChars)
  text?: string;

  /** Subtítulo do Ponto (modelo 02) ou do Versículo (modelo 04); vazio remove. O limite de cada modelo é do serviço. */
  @IsOptional()
  @IsString({ message: '$property deve ser um texto' })
  @MaxLength(SLIDE_MODEL_LIMITS.M02.subtitle)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  subtitle?: string;
}

export class SaveSlidesDto {
  @IsOptional()
  @IsIn(STYLES, { message: 'estilo de slides inválido' })
  style?: (typeof STYLES)[number];

  @IsArray()
  @ArrayMaxSize(SLIDE_LIMITS.items)
  @ValidateNested({ each: true })
  @Type(() => SlideItemInputDto)
  items!: SlideItemInputDto[];
}
