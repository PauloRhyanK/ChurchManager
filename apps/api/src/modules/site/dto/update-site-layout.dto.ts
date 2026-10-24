import { IsArray } from 'class-validator';

export class UpdateSiteLayoutDto {
  /**
   * Ordem dos blocos da página inicial. Que seja uma permutação exata dos
   * blocos conhecidos é verificado em `site-layout.ts`.
   */
  @IsArray({ message: 'home deve ser uma lista' })
  home!: unknown[];
}
