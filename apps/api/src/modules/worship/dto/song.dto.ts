import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { RequiredText, StrictBoolean } from '../../church/dto/field-decorators';
import { MAX_ROWS } from '../worship-document';
import { SongRowDto } from './song-row.dto';

export const MAX_RAW_LYRICS = 20_000;

const emptyToNull = ({ value }: { value: unknown }) => {
  if (value === null || value === undefined) return value;
  const s = String(value).trim();
  return s === '' ? null : s;
};

export class CreateSongAudioDto {
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(4 * 3600)
  durationSeconds?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sizeBytes?: number;
}

export class CreateSongDto {
  @RequiredText()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_RAW_LYRICS)
  rawLyrics?: string;

  /** true: o servidor já organiza a letra em partes e slides. */
  @IsOptional()
  @StrictBoolean()
  organize?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateSongAudioDto)
  audio?: CreateSongAudioDto;
}

export class UpdateSongDto {
  @RequiredText({ partial: true })
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(emptyToNull)
  artist?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  @Transform(emptyToNull)
  musicalKey?: string | null;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(300)
  bpm?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  @Transform(emptyToNull)
  timeSignature?: string | null;

  /** Id da música no acervo do Holyrics (texto livre; a Ponte usa para mostrar a letra). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(emptyToNull)
  holyricsId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ROWS)
  @ValidateNested({ each: true })
  @Type(() => SongRowDto)
  rows?: SongRowDto[];
}

export class OrganizeSongDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_RAW_LYRICS)
  rawLyrics?: string;
}

export class UploadAudioDto {
  /** Lida pelo navegador (`<audio>.duration`); o servidor não decodifica áudio. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(4 * 3600)
  durationSeconds?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;
}

export class ListSongsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(['READY', 'PENDING'])
  status?: 'READY' | 'PENDING';
}
