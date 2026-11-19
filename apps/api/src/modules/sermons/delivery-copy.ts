import type { Prisma, SermonSlideStyle } from '@prisma/client';
import { deliveryHasPassed } from './delivery-match';
import { parseStoredSlides, publicSlides, type PublicSlide } from './sermon-slides';

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

/** Lê os slides de um envio devolvendo só `kind`, `text` e `reference`; o que estiver fora do formato cai. */
export function readDeliverySlides(value: unknown): PublicSlide[] {
  if (!Array.isArray(value)) return [];
  const out: PublicSlide[] = [];
  for (const v of value) {
    if (typeof v !== 'object' || v === null) continue;
    const o = v as Record<string, unknown>;
    if (!PUBLIC_KINDS.includes(o.kind as PublicSlide['kind']) || typeof o.text !== 'string') continue;
    if (!(o.reference === null || typeof o.reference === 'string')) continue;
    out.push({ kind: o.kind as PublicSlide['kind'], text: o.text, reference: o.reference });
  }
  return out;
}
