import type { SlideItemInput } from "../api/sermons-api";
import { SLIDE_LIMITS, type SlideItem } from "./slides";

/** Tipos cujo texto o pregador pode trocar na conferência: Capa e Ponto. Versículo e lista mudam no esboço. */
export const EDITABLE_KINDS: SlideItem["kind"][] = ["TITLE", "POINT"];

/** Rótulo do tipo do slide na lista. */
export function slideTypeLabel(item: Pick<SlideItem, "kind" | "layout">): string {
  switch (item.kind) {
    case "TITLE":
      return "Capa";
    case "VERSE":
      return "Versículo";
    case "POINT":
      return "Ponto";
    case "SUMMARY":
      return item.layout === "NUMBERED" ? "Visão geral" : "Lista";
    default:
      return "Só para mim";
  }
}

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

/** Limite do texto editável (o mesmo que a API confere). */
export const TEXT_LIMIT = SLIDE_LIMITS.editableText;

/** Troca o texto da Capa ou de um Ponto (aparado, até 120 caracteres). Texto inválido ou igual devolve a mesma lista. */
export function editSlide(items: SlideItem[], id: string, raw: string): SlideItem[] {
  const text = raw.trim();
  const target = items.find((i) => i.id === id);
  if (!target || !EDITABLE_KINDS.includes(target.kind)) return items;
  if (text.length < 1 || chars(text) > TEXT_LIMIT || text === target.text) return items;
  return items.map((i) => (i.id === id ? { ...i, text, edited: true } : i));
}

/**
 * Corpo do salvamento: a lista inteira, montada campo a campo com id, included e `text` só quando a Capa ou o Ponto
 * foi editado.
 */
export function slidesBody(items: SlideItem[]): SlideItemInput[] {
  return items.map((i) => {
    const out: SlideItemInput = { id: i.id, included: i.kind === "PRIVATE" ? false : i.included };
    if (i.edited && EDITABLE_KINDS.includes(i.kind)) out.text = i.text;
    return out;
  });
}
