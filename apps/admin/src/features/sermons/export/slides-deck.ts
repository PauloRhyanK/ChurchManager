import type { SlideItem, SlideStyle } from "../lib/slides";

export type DeckSlide = {
  background: string;
  text: string;
  textColor: string;
  bold: boolean;
  fontSize: number;
  reference: string | null;
  referenceColor: string;
};

const COLORS: Record<
  SlideStyle,
  { background: string; text: string; muted: string }
> = {
  MINIMAL: { background: "#05070B", text: "#F5F6FA", muted: "#A5ABBB" },
  BACKGROUND: { background: "#1E3A8A", text: "#F5F6FA", muted: "#A5ABBB" },
};

/** Três degraus pelo comprimento do texto: até 60 → 44; até 140 → 32; acima → 24. */
function fontSizeFor(length: number): number {
  if (length <= 60) return 44;
  if (length <= 140) return 32;
  return 24;
}

/** Só itens marcados e não privados, na ordem: a anotação "Só para mim" nunca vai para a apresentação. */
export function buildDeck(slides: SlideItem[], style: SlideStyle): DeckSlide[] {
  const colors = COLORS[style];
  return slides
    .filter((s) => s.included && s.kind !== "PRIVATE")
    .map((s) => ({
      background: colors.background,
      text: s.text,
      textColor: colors.text,
      bold: s.kind !== "VERSE",
      fontSize: fontSizeFor(Array.from(s.text).length),
      reference: s.reference,
      referenceColor: colors.muted,
    }));
}
