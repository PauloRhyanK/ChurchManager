import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsString,
  IsUrl,
  ValidateBy,
  ValidateIf,
  isURL,
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

const HTTP_URL_OPTIONS = { protocols: ['http', 'https'], require_protocol: true, require_tld: false };

/** URL absoluta http/https (usar junto de IsOptional; '' já vira null). */
export function IsHttpUrl() {
  return IsUrl(HTTP_URL_OPTIONS, { message: '$property deve ser uma URL http ou https válida' });
}

/** Caminho servido pelo próprio site ('/x.jpg'); '//' e '\' apontariam para outro host. */
const SITE_PATH_RE = /^\/(?![/\\])[^\s\\]*$/;

/**
 * Imagem: URL http/https (R2) ou caminho do próprio site, como os dados
 * migrados do conteúdo legado (ex.: '/prRobsonJ.jpg'). Mesma regra de
 * `site-content.validation.ts`, sem aceitar '//host'.
 */
export function IsImageRef() {
  return ValidateBy(
    {
      name: 'isImageRef',
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && (SITE_PATH_RE.test(value) || isURL(value, HTTP_URL_OPTIONS)),
        defaultMessage: () => '$property deve ser uma URL http(s) ou um caminho iniciado por /',
      },
    },
  );
}
