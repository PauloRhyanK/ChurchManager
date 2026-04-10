import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListCotasQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 10;

  @IsOptional()
  @IsIn(['PAID', 'OVERDUE', 'PENDING'])
  status?: 'PAID' | 'OVERDUE' | 'PENDING';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}
