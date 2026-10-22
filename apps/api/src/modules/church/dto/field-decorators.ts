import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsString,
  IsUrl,
  ValidateIf,
} from 'class-validator';

/**
 * Texto obrigatório e aparado. `null`, vazio e só espaços são recusados
 * (antes `null` virava '' e passava). Em atualização (`partial`) o campo
 * pode ser omitido, mas, se enviado, segue a mesma regra.
 */
export function RequiredText(options: { partial?: boolean } = {}) {
  return applyDecorators(
    ...(options.partial ? [ValidateIf((_, v) => v !== undefined)] : []),
    IsString({ message: '$property deve ser um texto' }),
    IsNotEmpty({ message: '$property não pode ficar vazio' }),
    Transform(({ value }) => (typeof value === 'string' ? value.trim() : value)),
  );
}

/**
 * Booleano estrito. O `enableImplicitConversion` global transformaria a
 * string 'false' em true (Boolean('false')); aqui só aceitamos boolean real
 * ou as strings 'true'/'false'.
 */
export function StrictBoolean() {
  return applyDecorators(
    IsBoolean({ message: '$property deve ser verdadeiro ou falso' }),
    Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
      const raw = obj[key];
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      return raw;
    }),
  );
}

/** URL absoluta http/https (usar junto de IsOptional; '' já vira null). */
export function IsHttpUrl() {
  return IsUrl(
    { protocols: ['http', 'https'], require_protocol: true, require_tld: false },
    { message: '$property deve ser uma URL http ou https válida' },
  );
}
