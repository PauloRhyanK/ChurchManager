import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, MaxLength, ValidateNested } from 'class-validator';
import { RequiredText, StrictBoolean } from '../../church/dto/field-decorators';
import { SLIDE_LIMITS } from '../sermon-slides';

const MODES = ['VERSES', 'VERSES_AND_POINTS', 'FULL'] as const;
const STYLES = ['MINIMAL', 'BACKGROUND'] as const;

export class GenerateSlidesDto {
  @IsIn(MODES, { message: 'modo de slides inválido' })
  mode!: (typeof MODES)[number];

  @IsOptional()
  @IsIn(STYLES, { message: 'estilo de slides inválido' })
  style?: (typeof STYLES)[number];
}

/** Só o que o pregador decide em cada item; tipo, referência e origem vêm do que está gravado. */
export class SlideItemInputDto {
  @RequiredText()
  @MaxLength(120)
  id!: string;

  @StrictBoolean()
  included!: boolean;

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
