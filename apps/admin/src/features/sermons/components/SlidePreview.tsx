import type { PublicSlide, SlideStyle } from "../lib/slides";

const COLORS: Record<SlideStyle, { background: string; text: string; muted: string }> = {
  MINIMAL: { background: "#05070B", text: "#F5F6FA", muted: "#A5ABBB" },
  BACKGROUND: { background: "#1E3A8A", text: "#F5F6FA", muted: "#A5ABBB" },
};

export const SLIDE_BACKGROUNDS = { MINIMAL: COLORS.MINIMAL.background, BACKGROUND: COLORS.BACKGROUND.background } as const;

type Size = "sm" | "md" | "lg";
// Largura do cartão e tamanho-base do texto (px) em cada tamanho.
const SIZES: Record<Size, { width: number; font: number }> = {
  sm: { width: 168, font: 15 },
  md: { width: 288, font: 26 },
  lg: { width: 480, font: 44 },
};

/** Quatro degraus: texto curto, médio, longo e muito longo (o versículo partido chega a 220). */
function step(length: number): number {
  if (length <= 60) return 1;
  if (length <= 140) return 0.62;
  if (length <= 200) return 0.52;
  return 0.45;
}

const LINE_HEIGHT = 1.25;
const REF_LINE_HEIGHT = 1.3;
const round = (n: number) => Math.round(n * 10) / 10;

interface SlidePreviewProps {
  slide: Pick<PublicSlide, "kind" | "text" | "reference">;
  style: SlideStyle;
  size?: Size;
}

/** Cartão 16:9 do slide como o telão vai mostrar. A referência fica sempre embaixo; o texto ocupa o resto e é cortado em linhas. */
export function SlidePreview({ slide, style, size = "md" }: SlidePreviewProps) {
  const colors = COLORS[style];
  const { width, font } = SIZES[size];
  const bold = slide.kind !== "VERSE";
  const padding = width * 0.06;
  const gap = font * 0.3;
  const textSize = round(font * step(slide.text.length));
  const refSize = round(font * 0.5);
  // Linhas que cabem na altura que sobra depois do respiro e da linha da referência.
  const available = (width * 9) / 16 - 2 * padding - (slide.reference ? refSize * REF_LINE_HEIGHT + gap : 0);
  const lines = Math.max(1, Math.floor(available / (textSize * LINE_HEIGHT)));
  return (
    <div
      data-testid="slide-card"
      className="flex shrink-0 flex-col items-stretch overflow-hidden rounded-md text-center"
      style={{
        width,
        maxWidth: "100%",
        aspectRatio: "16 / 9",
        backgroundColor: colors.background,
        color: colors.text,
        padding,
        gap,
      }}
    >
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        <p
          data-lines={lines}
          className="m-0 overflow-hidden break-words"
          style={{
            fontSize: `${textSize}px`,
            fontWeight: bold ? 700 : 500,
            lineHeight: LINE_HEIGHT,
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: lines,
          }}
        >
          {slide.text}
        </p>
      </div>
      {slide.reference && (
        <p
          data-slide-reference
          className="m-0 shrink-0 truncate"
          style={{ fontSize: `${refSize}px`, lineHeight: REF_LINE_HEIGHT, color: colors.muted }}
        >
          {slide.reference}
        </p>
      )}
    </div>
  );
}
