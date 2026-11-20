// Identidade visual dos slides (docs/identidade-slides.md): as duas variações de cor e a fonte, num lugar só.
// As medidas ficam em PANEL (slides.ts, cópia do gerador da API); o desenho (slide-layout.ts) junta as duas coisas
// para a prévia (SlidePreview) e a apresentação (.pptx).
import type { SlideStyle } from "./slides";

export type SlideTheme = {
  /** Nome na interface. O valor gravado (MINIMAL/BACKGROUND) não muda. */
  name: string;
  /** Fundo do slide. */
  background: string;
  /** Fundo do painel de conteúdo. */
  panel: string;
  /** Borda do painel. */
  border: string;
  /** Texto principal (branco quente). */
  text: string;
  /** Destaque dourado: traço, aspa, referência, números e marcadores. */
  accent: string;
};

export const SLIDE_THEMES: Record<SlideStyle, SlideTheme> = {
  MINIMAL: { name: "Verde", background: "#24352F", panel: "#2C3F38", border: "#42584F", text: "#F6F2EA", accent: "#E3B862" },
  BACKGROUND: { name: "Azul-marinho", background: "#11223B", panel: "#182D4B", border: "#2B4468", text: "#F6F2EA", accent: "#E3B862" },
};

/** Fonte única dos slides (Google Fonts, pesos 500, 600, 700 e 800; ver ../slide-identity.css). */
export const SLIDE_FONT = "Montserrat";
/** Pilha CSS com as alternativas do manual. */
export const SLIDE_FONT_STACK = `"${SLIDE_FONT}", "Helvetica Neue", Arial, sans-serif`;
