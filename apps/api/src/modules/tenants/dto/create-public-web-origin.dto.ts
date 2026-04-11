import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePublicWebOriginDto {
  /** Origem de browser (ex.: `https://www.igreja.org` ou `http://localhost:3001`). Sem path. */
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  origin!: string;
}
