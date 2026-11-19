import { IsOptional, IsString, MaxLength } from 'class-validator';
import { RequiredText } from '../../church/dto/field-decorators';
import { PASTE_LIMITS } from '../sermon-outline';

/** "Colar texto": o texto do sermão como o pregador colou e, opcionalmente, o modelo de IA (id de GET /sermons/ai). */
export class CreateFromTextDto {
  @RequiredText()
  @MaxLength(PASTE_LIMITS.chars, { message: `o texto passa de ${PASTE_LIMITS.chars} caracteres` })
  text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  model?: string;
}
