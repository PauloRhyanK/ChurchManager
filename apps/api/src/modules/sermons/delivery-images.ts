import { createHash } from 'node:crypto';
import type { PublicSlide, SlideStyle } from './sermon-slides';

/**
 * Versão do desenho dos slides (o `drawSlide` do painel). Muda quando o desenho mudar:
 * todos os hashes mudam junto e as imagens antigas deixam de valer.
 */
export const RENDER_VERSION = 'painel-1';

/** Tamanho de toda imagem de slide: 1920×1080 (16:9). */
export const SLIDE_IMAGE_WIDTH = 1920;
export const SLIDE_IMAGE_HEIGHT = 1080;

export const SLIDE_HASH_PATTERN = /^[0-9a-f]{16}$/;

const sha16 = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);

/** A identidade de uma imagem: muda quando muda o que aparece no slide, o estilo ou o desenho. */
export function slideHash(style: SlideStyle, slide: PublicSlide): string {
  return sha16([
    RENDER_VERSION,
    style,
    slide.kind,
    slide.layout,
    slide.title,
    slide.verse,
    slide.reference,
    slide.items,
    slide.start,
  ]);
}

/** A versão do envio: muda quando qualquer slide, o estilo ou o título mudam. */
export function deliveryVersion(style: SlideStyle, title: string, hashes: string[]): string {
  return sha16([RENDER_VERSION, style, title, hashes]);
}

/** Chave do objeto no R2. O nome vem do conteúdo: o mesmo slide grava sempre no mesmo arquivo. */
export function slideImageKey(tenantId: string, deliveryId: string, hash: string): string {
  return `tenants/${tenantId}/sermons/${deliveryId}/${hash}.png`;
}

/** Lê o mapa `hash → url` gravado no envio; o que estiver fora do formato cai. */
export function readSlideImages(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return out;
  for (const [hash, url] of Object.entries(value as Record<string, unknown>)) {
    if (SLIDE_HASH_PATTERN.test(hash) && typeof url === 'string' && url) out[hash] = url;
  }
  return out;
}
