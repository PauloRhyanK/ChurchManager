import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class BibleSearchQuery {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  q!: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  translation?: string;
}
