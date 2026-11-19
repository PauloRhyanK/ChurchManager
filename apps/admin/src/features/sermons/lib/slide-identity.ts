// Identidade visual dos slides: os números de docs/identidade-slides.md ("Como o sistema aplica"), num lugar só.
// A prévia (SlidePreview) e a apresentação (.pptx) leem daqui por meio de drawSlide (slide-layout.ts).
import type { SlideStyle } from "./slides";

/** Tela de referência: tudo é calculado em pixels nela e reduzido em escala na prévia. */
export const SLIDE_CANVAS = { width: 1920, height: 1080 } as const;

/** Área de segurança: 240 px nas laterais, 190 px em cima e embaixo. */
export const SLIDE_SAFE_AREA = { side: 240, vertical: 190 } as const;

export const SLIDE_PALETTE = {
  oliveGreen: "#708836", // reservado
  institutionalBlue: "#334C71",
  deepBlue: "#182F5D",
  deepGreen: "#092A1E",
  lightBlue: "#A1C0DA", // reservado
  offWhite: "#F1EBE2",
  white: "#FFFFFF",
} as const;

export type SlideTheme = {
  /** Nome na interface. O valor gravado (MINIMAL/BACKGROUND) não muda. */
  name: string;
  /** Modelos 02, 03 e 04. */
  background: string;
  color: string;
  /** Modelo 01 (impacto). */
  impact: { background: string; color: string };
};

export const SLIDE_THEMES: Record<SlideStyle, SlideTheme> = {
  MINIMAL: {
    name: "Azul institucional",
    background: SLIDE_PALETTE.institutionalBlue,
    color: SLIDE_PALETTE.offWhite,
    impact: { background: SLIDE_PALETTE.deepBlue, color: SLIDE_PALETTE.offWhite },
  },
  BACKGROUND: {
    name: "Verde profundo",
    background: SLIDE_PALETTE.deepGreen,
    color: SLIDE_PALETTE.white,
    impact: { background: SLIDE_PALETTE.deepGreen, color: SLIDE_PALETTE.white },
  },
};

// ---- Fontes ----

/** Substituta da Palast Var enquanto a igreja não fornece os arquivos licenciados (Google Fonts, licença aberta). */
export const SLIDE_TITLE_FONT_DEFAULT = "Playfair Display";
export const SLIDE_BODY_FONT = "Poppins";
export const PALAST_VAR = "Palast Var";
/**
 * Arquivos da Palast Var em apps/admin/public/fonts/ (não vão para o repositório sem licença; ver LEIA-ME.md lá).
 * A prévia os usa quando VITE_SLIDE_TITLE_FONT=Palast Var; o @font-face fica em ../slide-identity.css.
 */
export const PALAST_VAR_FILES = { roman: "/fonts/PalastVar.woff2", italic: "/fonts/PalastVar-Italic.woff2" } as const;

/** Fonte de título configurada (VITE_SLIDE_TITLE_FONT), ou Playfair Display. */
export function slideTitleFont(configured: unknown = import.meta.env.VITE_SLIDE_TITLE_FONT): string {
  const value = typeof configured === "string" ? configured.trim() : "";
  return value || SLIDE_TITLE_FONT_DEFAULT;
}

/** Nomes das duas fontes, como vão para a prévia (CSS) e para a apresentação (.pptx). */
export const SLIDE_FONTS = { title: slideTitleFont(), body: SLIDE_BODY_FONT } as const;

// ---- Medidas por modelo ----

export type FontRange = { min: number; max: number };

/** Faixas de tamanho (px) de cada bloco em cada modelo. A fonte nunca sai daqui. */
export const SLIDE_FONT_SIZES = {
  M01: { title: { min: 100, max: 150 } },
  M02: { title: { min: 95, max: 135 }, subtitle: { min: 36, max: 48 } },
  M03: { title: { min: 95, max: 135 }, verse: { min: 36, max: 46 }, reference: { min: 36, max: 42 } },
  M04: { title: { min: 85, max: 115 }, subtitle: { min: 34, max: 42 }, verse: { min: 30, max: 38 }, reference: { min: 30, max: 38 } },
} as const satisfies Record<string, Record<string, FontRange>>;

/** Tracking em milésimos de em: títulos -70; subtítulos e título do modelo 04 -50; versículos (e a referência) -30. */
export const SLIDE_TRACKING = { title: -70, smallTitle: -50, subtitle: -50, verse: -30, reference: -30 } as const;

/** Pesos: título em itálico médio; subtítulo e versículo em Poppins médio; referência em Poppins negrito. */
export const SLIDE_WEIGHTS = { title: 500, subtitle: 500, verse: 500, reference: 700 } as const;

/** Espaços entre blocos (px). */
export const SLIDE_SPACING = { titleSubtitle: 55, titleVerse: 70, subtitleVerse: 40, verseReference: 12 } as const;

/** Acima destes comprimentos o slide inteiro alinha à esquerda, num eixo só. */
export const SLIDE_LEFT_ALIGN_OVER = { verse: 110, title: 35 } as const;

/** Modelo 01 no centro óptico: o centro vertical sobe 3% da altura. */
export const SLIDE_OPTICAL_SHIFT = 0.03;

// Os valores abaixo não estão no manual: são escolhas do sistema para estimar as linhas.

/** Altura de linha (múltiplo do tamanho da fonte). */
export const SLIDE_LINE_HEIGHT = { title: 1.1, subtitle: 1.3, verse: 1.35, reference: 1.3 } as const;

/**
 * Largura média de um caractere (em), para estimar onde as linhas quebram. Letra maiúscula conta `upper` em qualquer
 * fonte (medido na Playfair Display itálica: 0,56 a 0,68 em); os outros caracteres, a largura da fonte.
 */
export const SLIDE_GLYPH_WIDTH = { title: 0.5, body: 0.58, upper: 0.68 } as const;

/** Espaço entre título e versículo no modelo 03: de 70 (SLIDE_SPACING.titleVerse) até no máximo 90; o que sobra fica embaixo. */
export const SLIDE_TITLE_VERSE_MAX_GAP = 90;
