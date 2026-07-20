import { BadRequestException } from '@nestjs/common';
import {
  SITE_ICONS,
  type SiteFieldSpec,
  type SiteSectionSpec,
} from './site-content.registry';

/** Aceita URLs absolutos http(s) e caminhos relativos servidos pelo próprio site. */
const URL_RE = /^(https?:\/\/\S+|\/\S*)$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value)
  );
}

function validateField(
  spec: SiteFieldSpec,
  raw: unknown,
  path: string,
  errors: string[],
): unknown {
  if (spec.type === 'boolean') {
    if (raw === undefined || raw === null) return false;
    if (typeof raw !== 'boolean') {
      errors.push(`${path}: deve ser verdadeiro ou falso`);
      return false;
    }
    return raw;
  }

  if (spec.type === 'list') {
    if (raw === undefined || raw === null) return [];
    if (!Array.isArray(raw)) {
      errors.push(`${path}: deve ser uma lista`);
      return [];
    }
    if (spec.maxItems !== undefined && raw.length > spec.maxItems) {
      errors.push(`${path}: no máximo ${spec.maxItems} itens`);
      return [];
    }
    return raw.map((item, index) => {
      const itemPath = `${path}[${index}]`;
      if (!isPlainObject(item)) {
        errors.push(`${itemPath}: deve ser um objeto`);
        return {};
      }
      return validateFields(spec.fields ?? [], item, itemPath, errors);
    });
  }

  // Restantes tipos são strings.
  if (raw === undefined || raw === null) {
    if (spec.required) errors.push(`${path}: obrigatório`);
    return '';
  }
  if (typeof raw !== 'string') {
    errors.push(`${path}: deve ser texto`);
    return '';
  }

  const value = raw.trim();

  if (value === '') {
    if (spec.required) errors.push(`${path}: obrigatório`);
    return '';
  }

  const maxLength = spec.maxLength ?? 500;
  if (value.length > maxLength) {
    errors.push(`${path}: máximo de ${maxLength} caracteres`);
    return value.slice(0, maxLength);
  }

  if ((spec.type === 'url' || spec.type === 'image') && !URL_RE.test(value)) {
    errors.push(`${path}: deve ser um URL http(s) ou um caminho iniciado por /`);
    return '';
  }

  if (spec.type === 'icon' && !SITE_ICONS.includes(value as never)) {
    errors.push(`${path}: ícone inválido (use um de: ${SITE_ICONS.join(', ')})`);
    return '';
  }

  return value;
}

function validateFields(
  specs: SiteFieldSpec[],
  raw: Record<string, unknown>,
  basePath: string,
  errors: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const spec of specs) {
    const path = basePath ? `${basePath}.${spec.name}` : spec.name;

    // Campo ausente fica ausente, para continuar a cair no default do registry.
    // Enviar string vazia é diferente: é uma limpeza deliberada e é gravada.
    if (!(spec.name in raw)) {
      if (spec.required) errors.push(`${path}: obrigatório`);
      continue;
    }

    out[spec.name] = validateField(spec, raw[spec.name], path, errors);
  }
  // Propriedades fora do registry são descartadas em silêncio: mantém a linha
  // limpa quando um campo é removido sem obrigar o painel a reenviar o valor.
  return out;
}

/**
 * Normaliza e valida o `value` de uma secção contra o respetivo spec.
 * Lança BadRequest com a lista de erros (o painel junta-os na mensagem).
 */
export function validateSectionValue(
  section: SiteSectionSpec,
  raw: unknown,
): Record<string, unknown> {
  if (!isPlainObject(raw)) {
    throw new BadRequestException('O conteúdo da secção deve ser um objeto');
  }

  const errors: string[] = [];
  const value = validateFields(section.fields, raw, '', errors);

  if (section.key === 'churches' && Array.isArray(value.items)) {
    value.items.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object') return;
      const item = entry as Record<string, unknown>;
      const visible = item.active !== false;
      const address =
        typeof item.address === 'string' ? item.address.trim() : '';
      if (visible && !address) {
        errors.push(
          `items[${index}].address: preencha o endereço completo para o mapa`,
        );
      }
    });
  }

  if (errors.length > 0) {
    throw new BadRequestException(errors);
  }

  return value;
}
