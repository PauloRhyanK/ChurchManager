import { drawSlide, type SlideDrawing } from "../lib/slide-layout";
import { publicSlides, type SlideItem, type SlideStyle } from "../lib/slides";

/** Um slide da apresentação: o desenho de drawSlide, o mesmo da prévia. */
export type DeckSlide = SlideDrawing;

/** Só itens marcados e não privados, na ordem: a anotação "Só para mim" nunca vai para a apresentação. */
export function buildDeck(slides: SlideItem[], style: SlideStyle): DeckSlide[] {
  return publicSlides(slides).map((s) => drawSlide(s, style));
}
