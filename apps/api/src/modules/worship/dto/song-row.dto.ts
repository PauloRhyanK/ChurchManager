import { Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  CUE_TARGETS,
  CueTarget,
  MAX_ROW_TEXT,
  MAX_TIME_SECONDS,
  MOODS,
  Mood,
  PART_KINDS,
  PartKind,
  TIME_SOURCES,
  TimeSource,
} from '../worship-document';

export class RowPartDto {
  @IsIn(PART_KINDS, { message: 'tipo de parte inválido' })
  kind!: PartKind;

  @ValidateIf((_, v) => v !== null)
  @IsIn(MOODS, { message: 'clima inválido' })
  mood!: Mood | null;
}

/** Uma linha do documento da letra. Ver `worship-document.ts`. */
export class SongRowDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(36)
  id!: string;

  @IsIn(['lyric', 'cue', 'break'], { message: 'tipo de linha inválido' })
  type!: 'lyric' | 'cue' | 'break';

  @IsOptional()
  @IsString()
  @MaxLength(MAX_ROW_TEXT)
  text?: string;

  @IsOptional()
  @IsIn(CUE_TARGETS, { message: 'destinatário da instrução inválido' })
  target?: CueTarget;

  @IsOptional()
  @ValidateNested()
  @Type(() => RowPartDto)
  part?: RowPartDto;

  // Sem tipo declarado de propósito: a conversão implícita global transformaria
  // `null` em 0, e "sem tempo" viraria "começa no segundo zero".
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(MAX_TIME_SECONDS)
  time?: unknown;

  @IsOptional()
  @IsIn(TIME_SOURCES)
  timeSource?: TimeSource;
}
