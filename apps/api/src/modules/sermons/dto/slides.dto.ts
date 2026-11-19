import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, MaxLength, ValidateNested } from 'class-validator';
import { RequiredText, StrictBoolean } from '../../church/dto/field-decorators';
import { SLIDE_LIMITS, SLIDE_MODES } from '../sermon-slides';

const STYLES = ['MINIMAL', 'BACKGROUND'] as const;

export class GenerateSlidesDto {
  /** "Com versículos" ou "Só títulos". VERSES e FULL ficam só nas linhas antigas. */
  @IsIn(SLIDE_MODES, { message: 'modo de slides inválido' })
  mode!: (typeof SLIDE_MODES)[number];

  @IsOptional()
  @IsIn(STYLES, { message: 'estilo de slides inválido' })
  style?: (typeof STYLES)[number];
}

/** Só o que o pregador decide em cada item; tipo, referência, origem, layout, título e itens vêm do que está gravado. */
export class SlideItemInputDto {
  @RequiredText()
  @MaxLength(120)
  id!: string;

  @StrictBoolean()
  included!: boolean;

  /** Só Capa e Ponto; o limite de 120 é do serviço. */
  @RequiredText({ partial: true })
  @MaxLength(SLIDE_LIMITS.textChars)
  text?: string;
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
