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

/** Três degraus: texto curto, médio e longo. */
function step(length: number): number {
  if (length <= 60) return 1;
  if (length <= 140) return 0.78;
  return 0.6;
}

interface SlidePreviewProps {
  slide: Pick<PublicSlide, "kind" | "text" | "reference">;
  style: SlideStyle;
  size?: Size;
}

/** Cartão 16:9 do slide como o telão vai mostrar. */
export function SlidePreview({ slide, style, size = "md" }: SlidePreviewProps) {
  const colors = COLORS[style];
  const { width, font } = SIZES[size];
  const bold = slide.kind !== "VERSE";
  return (
    <div
      data-testid="slide-card"
      className="flex shrink-0 flex-col items-center justify-center overflow-hidden rounded-md text-center"
      style={{
        width,
        maxWidth: "100%",
        aspectRatio: "16 / 9",
        backgroundColor: colors.background,
        color: colors.text,
        padding: width * 0.06,
        gap: font * 0.4,
      }}
    >
      <p
        className="m-0 break-words"
        style={{ fontSize: `${Math.round(font * step(slide.text.length) * 10) / 10}px`, fontWeight: bold ? 700 : 500, lineHeight: 1.25 }}
      >
        {slide.text}
      </p>
      {slide.reference && (
        <p data-slide-reference className="m-0" style={{ fontSize: `${Math.round(font * 0.5 * 10) / 10}px`, color: colors.muted }}>
          {slide.reference}
        </p>
      )}
    </div>
  );
}
