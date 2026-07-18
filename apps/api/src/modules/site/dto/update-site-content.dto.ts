import { IsDefined } from 'class-validator';

export class UpdateSiteContentDto {
  /**
   * Objeto com os campos da secção. A forma concreta depende da `key` e é
   * validada em `site-content.validation.ts` contra o registry.
   */
  @IsDefined({ message: 'value é obrigatório' })
  value!: unknown;
}
