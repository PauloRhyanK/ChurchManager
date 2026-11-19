import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { MAX_ROWS } from '../worship-document';
import { LEAD_LIMITS, MAX_INSTRUCTION, TIMING_SOURCES, type TimingSource } from '../timing-learning';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value);

export class TimingSettingsDto {
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(LEAD_LIMITS.min)
  @Max(LEAD_LIMITS.max)
  slideLeadSeconds!: number;
}

export class TimingSuggestDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Escreva o que ajustar.' })
  @MaxLength(MAX_INSTRUCTION)
  instruction!: string;
}

/** Uma correção feita à mão: os tempos antes e depois, um por slide (número ou null). */
export class TimingCorrectionDto {
  @IsIn(TIMING_SOURCES)
  source!: TimingSource;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(MAX_INSTRUCTION)
  instruction?: string;

  @IsArray()
  @ArrayMaxSize(MAX_ROWS)
  before!: unknown[];

  @IsArray()
  @ArrayMaxSize(MAX_ROWS)
  after!: unknown[];
}
