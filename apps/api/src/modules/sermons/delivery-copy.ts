import type { Prisma, SermonSlideStyle } from '@prisma/client';
import { deliveryHasPassed } from './delivery-match';
import { SLIDE_LAYOUTS, parseStoredSlides, publicSlides, slideFace, type PublicSlide, type SlideLayout } from './sermon-slides';

const ymd = (date: Date) => date.toISOString().slice(0, 10);
const PUBLIC_KINDS: PublicSlide['kind'][] = ['TITLE', 'VERSE', 'POINT', 'SUMMARY'];

/** O que o envio copia da palavra. */
export type CopySource = {
  title: string;
  estimatedSeconds: number;
  slideStyle: SermonSlideStyle;
  slides: Prisma.JsonValue;
  delivery: { id: string; date: Date; startTime: string } | null;
};

/** Os campos copiados para o envio. Os slides são sempre `publicSlides`: nada PRIVATE, nada desmarcado. */
export function deliveryCopy(sermon: Omit<CopySource, 'delivery'>) {
  return {
    title: sermon.title,
    estimatedSeconds: sermon.estimatedSeconds,
    slideStyle: sermon.slideStyle,
    slides: publicSlides(parseStoredSlides(sermon.slides)) as unknown as Prisma.InputJsonValue,
  };
}

/**
 * Regrava a cópia no envio da palavra, se houver envio e ele ainda não passou: o envio passado é o
 * registro do que foi pregado. Usada pelo envio, pelos slides e pelo salvar do título e do documento.
 */
export async function syncDeliveryCopy(
  tx: Prisma.TransactionClient,
  sermon: CopySource,
  now: Date,
  timeZone: string,
): Promise<boolean> {
  const delivery = sermon.delivery;
  if (!delivery || deliveryHasPassed(ymd(delivery.date), delivery.startTime, now, timeZone)) return false;
  await tx.sermonDelivery.update({ where: { id: delivery.id }, data: deliveryCopy(sermon) });
  return true;
}

const textOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string';
const stringList = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : null;

/**
 * Lê os slides de um envio: `kind`, `text`, `reference` e os campos de `slideFace`; o que estiver fora do formato cai.
 * Linha gravada antes da identidade "painel" (só `kind`, `text` e `reference`, ou com os modelos M01–M04) é
 * refeita com `slideFace`: o `title` antigo vira o título do slide de VERSE e SUMMARY, e o subtítulo é ignorado.
 */
export function readDeliverySlides(value: unknown): PublicSlide[] {
  if (!Array.isArray(value)) return [];
  const out: PublicSlide[] = [];
  for (const v of value) {
    if (typeof v !== 'object' || v === null) continue;
    const o = v as Record<string, unknown>;
    if (!PUBLIC_KINDS.includes(o.kind as PublicSlide['kind']) || typeof o.text !== 'string') continue;
    if (!textOrNull(o.reference)) continue;
    const kind = o.kind as PublicSlide['kind'];
    const layout = SLIDE_LAYOUTS.includes(o.layout as SlideLayout) ? (o.layout as SlideLayout) : undefined;
    const heading = typeof o.title === 'string' && o.title && (kind === 'VERSE' || kind === 'SUMMARY') ? o.title : null;
    const face = slideFace({
      kind,
      text: o.text,
      reference: o.reference,
      layout,
      heading,
      items: layout ? stringList(o.items) : null,
      start: typeof o.start === 'number' ? o.start : null,
    });
    out.push({ kind, text: o.text, ...face });
  }
  return out;
}
