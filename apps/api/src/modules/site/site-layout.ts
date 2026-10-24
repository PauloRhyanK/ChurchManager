import { BadRequestException } from '@nestjs/common';
import { SITE_HOME_BLOCKS, type SiteHomeBlock } from './site-content.registry';

const KNOWN = new Set<string>(SITE_HOME_BLOCKS);

function isHomeBlock(value: unknown): value is SiteHomeBlock {
  return typeof value === 'string' && KNOWN.has(value);
}

/**
 * Ordem enviada pelo painel: tem de ser uma permutação exata dos blocos, para
 * nenhum bloco sumir do site por engano.
 */
export function validateHomeOrder(raw: unknown): SiteHomeBlock[] {
  const message = `A ordem deve conter cada bloco uma única vez: ${SITE_HOME_BLOCKS.join(', ')}.`;
  if (!Array.isArray(raw) || raw.length !== SITE_HOME_BLOCKS.length) {
    throw new BadRequestException(message);
  }
  if (!raw.every(isHomeBlock) || new Set(raw).size !== raw.length) {
    throw new BadRequestException(message);
  }
  return [...raw];
}

/**
 * Ordem guardada → ordem servida. Tolera um registry que mudou depois de a
 * ordem ser salva: ids que já não existem saem e blocos novos entram logo a
 * seguir ao bloco que os antecede na ordem padrão.
 */
export function normalizeHomeOrder(
  stored: readonly string[] | null | undefined,
): SiteHomeBlock[] {
  const order: SiteHomeBlock[] = [];
  for (const id of stored ?? []) {
    if (isHomeBlock(id) && !order.includes(id)) order.push(id);
  }
  SITE_HOME_BLOCKS.forEach((id, index) => {
    if (order.includes(id)) return;
    const previous = SITE_HOME_BLOCKS.slice(0, index)
      .reverse()
      .find((candidate) => order.includes(candidate));
    order.splice(previous ? order.indexOf(previous) + 1 : 0, 0, id);
  });
  return order;
}
