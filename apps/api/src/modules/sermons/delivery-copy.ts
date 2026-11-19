import type { Prisma, SermonSlideStyle } from '@prisma/client';
import { deliveryHasPassed } from './delivery-match';
import { SLIDE_LAYOUTS, parseStoredSlides, publicFaces, publicSlides, slideFace, type PublicSlide, type SlideLayout } from './sermon-slides';

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

/**
 * Lê os slides de um envio: `kind`, `text` e os campos de `slideFace`; o que estiver fora do formato cai.
 * Linha gravada antes dos modelos (só `kind`, `text` e `reference`) é completada com `slideFace` e, se passar do
 * limite do modelo, dividida com `splitFaceForLimits`.
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
    const hasFace =
      SLIDE_LAYOUTS.includes(o.layout as SlideLayout) && typeof o.title === 'string' && textOrNull(o.subtitle) && textOrNull(o.verse);
    const face = hasFace
      ? {
          layout: o.layout as SlideLayout,
          title: o.title as string,
          subtitle: o.subtitle as string | null,
          verse: o.verse as string | null,
          reference: o.reference,
        }
      : slideFace({ kind, text: o.text, reference: o.reference });
    // Linha acima do limite do modelo (ex.: ponto antigo de 300) sai em mais slides, nunca encolhida.
    out.push(...publicFaces(kind, o.text, face));
  }
  return out;
}
