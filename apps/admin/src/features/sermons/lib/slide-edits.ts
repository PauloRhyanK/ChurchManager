import type { SlideItemInput } from "../api/sermons-api";
import { SLIDE_LIMITS, type SlideItem } from "./slides";

/** Tipos cujo texto o pregador pode trocar na conferência. */
export const EDITABLE_KINDS: SlideItem["kind"][] = ["TITLE", "POINT"];

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

/** Troca o texto de um título ou ponto (1 a 300, aparado). Texto inválido ou igual devolve a mesma lista. */
export function editSlide(items: SlideItem[], id: string, raw: string): SlideItem[] {
  const text = raw.trim();
  const target = items.find((i) => i.id === id);
  if (!target || !EDITABLE_KINDS.includes(target.kind)) return items;
  if (text.length < 1 || text.length > SLIDE_LIMITS.textChars || text === target.text) return items;
  return items.map((i) => (i.id === id ? { ...i, text, edited: true } : i));
}

/** Corpo do salvamento: a lista inteira, só com id, included e (se editado) text. */
export function slidesBody(items: SlideItem[]): SlideItemInput[] {
  return items.map((i) => {
    const out: SlideItemInput = { id: i.id, included: i.kind === "PRIVATE" ? false : i.included };
    if (i.edited && i.kind !== "PRIVATE") out.text = i.text;
    return out;
  });
}
