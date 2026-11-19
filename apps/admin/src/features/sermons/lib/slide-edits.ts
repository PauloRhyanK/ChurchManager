import type { SlideItemInput } from "../api/sermons-api";
import { SLIDE_MODEL_LIMITS, type SlideItem } from "./slides";

/** Tipos cujo texto o pregador pode trocar na conferência. */
export const EDITABLE_KINDS: SlideItem["kind"][] = ["TITLE", "POINT", "SUMMARY"];

const chars = (s: string) => Array.from(s).length;
const privateLast = (items: SlideItem[]) => [...items.filter((i) => i.kind !== "PRIVATE"), ...items.filter((i) => i.kind === "PRIVATE")];

/** Leva `fromId` para o lugar de `toId`. Privados não se movem e ficam no fim; sem mudança devolve a mesma lista. */
export function moveSlide(items: SlideItem[], fromId: string, toId: string): SlideItem[] {
  if (fromId === toId) return items;
  const from = items.findIndex((i) => i.id === fromId);
  const to = items.findIndex((i) => i.id === toId);
  if (from < 0 || to < 0 || items[from].kind === "PRIVATE" || items[to].kind === "PRIVATE") return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return privateLast(next);
}

/** Marca ou desmarca um item. Privado fica sempre desmarcado. */
export function toggleSlide(items: SlideItem[], id: string, included: boolean): SlideItem[] {
  return items.map((i) => (i.id === id ? { ...i, included: i.kind === "PRIVATE" ? false : included } : i));
}

/** Limite do texto editável no modelo do item (o mesmo que a API confere): título e ponto 75 (ponto com subtítulo 60); resumo 150. */
export function textLimit(item: SlideItem): number {
  if (item.kind === "SUMMARY") return SLIDE_MODEL_LIMITS.M02.subtitle;
  if (item.kind === "POINT" && item.layout === "M02" && item.subtitle) return SLIDE_MODEL_LIMITS.M02.title;
  return SLIDE_MODEL_LIMITS.M01.title;
}

/**
 * Limite do subtítulo do item, ou `null` quando ele não pode ter um: ponto com título de até 60 (modelo 02);
 * primeiro pedaço do versículo com até 160 caracteres (modelo 04).
 */
export function subtitleLimit(item: SlideItem): number | null {
  if (item.kind === "POINT") return chars(item.text) <= SLIDE_MODEL_LIMITS.M02.title ? SLIDE_MODEL_LIMITS.M02.subtitle : null;
  if (item.kind === "VERSE") {
    return item.id.endsWith(":0") && item.text.length <= SLIDE_MODEL_LIMITS.M04.verse ? SLIDE_MODEL_LIMITS.M04.subtitle : null;
  }
  return null;
}

/** Troca o texto de um título, ponto ou resumo (aparado, até o limite do modelo). Texto inválido ou igual devolve a mesma lista. */
export function editSlide(items: SlideItem[], id: string, raw: string): SlideItem[] {
  const text = raw.trim();
  const target = items.find((i) => i.id === id);
  if (!target || !EDITABLE_KINDS.includes(target.kind)) return items;
  if (text.length < 1 || chars(text) > textLimit(target) || text === target.text) return items;
  return items.map((i) => (i.id === id ? { ...i, text, edited: true } : i));
}

/**
 * Põe, troca ou (vazio) tira o subtítulo de um ponto ou versículo, com o modelo que vem junto (02/04 ou 01/03).
 * Não mexe nas marcas de edição: quem as grava é o servidor. Inválido ou igual devolve a mesma lista.
 */
export function editSubtitle(items: SlideItem[], id: string, raw: string): SlideItem[] {
  const subtitle = raw.trim() || null;
  const target = items.find((i) => i.id === id);
  if (!target) return items;
  const limit = subtitleLimit(target);
  if (limit === null || subtitle === target.subtitle || (subtitle !== null && chars(subtitle) > limit)) return items;
  const point = target.kind === "POINT";
  const layout = subtitle ? (point ? "M02" : "M04") : point ? "M01" : "M03";
  return items.map((i) => (i.id === id ? { ...i, subtitle, layout } : i));
}

/**
 * Corpo do salvamento: a lista inteira, só com id, included, `text` quando editado e `subtitle` (ponto e versículo)
 * quando difere do que está gravado (`saved`); "" tira o subtítulo.
 */
export function slidesBody(items: SlideItem[], saved: SlideItem[] = []): SlideItemInput[] {
  const savedById = new Map(saved.map((s) => [s.id, s]));
  return items.map((i) => {
    const out: SlideItemInput = { id: i.id, included: i.kind === "PRIVATE" ? false : i.included };
    if (i.edited && EDITABLE_KINDS.includes(i.kind)) out.text = i.text;
    if ((i.kind === "POINT" || i.kind === "VERSE") && (i.subtitle ?? null) !== (savedById.get(i.id)?.subtitle ?? null)) {
      out.subtitle = i.subtitle ?? "";
    }
    return out;
  });
}
