import "../slide-identity.css";
import { SLIDE_CANVAS, SLIDE_FONTS, SLIDE_TITLE_FONT_DEFAULT } from "../lib/slide-identity";
import { drawSlide, type SlideBlock } from "../lib/slide-layout";
import { slideFace, type SlideFace, type SlideFaceInput, type SlideStyle } from "../lib/slides";

type Size = "sm" | "md" | "lg";
/** Largura do cartão (px) em cada tamanho. */
const SIZES: Record<Size, number> = { sm: 168, md: 288, lg: 480 };

const quote = (name: string) => `"${name}"`;
const FAMILIES: Record<SlideBlock["fontFamily"], string> = {
  title: [...new Set([SLIDE_FONTS.title, SLIDE_TITLE_FONT_DEFAULT])].map(quote).join(", ") + ", serif",
  body: `${quote(SLIDE_FONTS.body)}, sans-serif`,
};

/** Slide já no formato do modelo (PublicSlide) ou ainda por montar (item do editor, cópia antiga só com kind/text/reference). */
export type PreviewSlide = SlideFace | SlideFaceInput;

function toFace(slide: PreviewSlide): SlideFace {
  return "title" in slide && typeof slide.title === "string" && "layout" in slide && slide.layout ? (slide as SlideFace) : slideFace(slide as SlideFaceInput);
}

interface SlidePreviewProps {
  slide: PreviewSlide;
  style: SlideStyle;
  size?: Size;
}

/** Cartão 16:9 do slide como o telão vai mostrar: desenhado em 1920×1080 por drawSlide e reduzido em escala. */
export function SlidePreview({ slide, style, size = "md" }: SlidePreviewProps) {
  const drawing = drawSlide(toFace(slide), style);
  const width = SIZES[size];
  return (
    <div
      data-testid="slide-card"
      className="relative shrink-0 overflow-hidden rounded-md"
      style={{ width, maxWidth: "100%", aspectRatio: "16 / 9", backgroundColor: drawing.background }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: `${SLIDE_CANVAS.width}px`,
          height: `${SLIDE_CANVAS.height}px`,
          transform: `scale(${width / SLIDE_CANVAS.width})`,
          transformOrigin: "top left",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          paddingTop: drawing.previewTop,
          paddingLeft: drawing.blocks[0]?.x ?? 0,
          paddingRight: drawing.blocks[0]?.x ?? 0,
          color: drawing.color,
        }}
      >
        {drawing.blocks.map((b) => (
          <p
            key={b.role}
            data-slide-role={b.role}
            data-lines={b.maxLines}
            data-clamped={b.clamped || undefined}
            className="m-0 shrink-0 break-words"
            style={{
              marginTop: b.gapBefore,
              fontFamily: FAMILIES[b.fontFamily],
              fontSize: `${b.fontSize}px`,
              fontWeight: b.fontWeight,
              fontStyle: b.italic ? "italic" : "normal",
              letterSpacing: `${b.tracking / 1000}em`,
              lineHeight: b.lineHeight,
              textAlign: b.align,
              // Só o texto acima do limite do modelo é cortado em linhas; dentro do limite a caixa cresce.
              ...(b.clamped
                ? { display: "-webkit-box", WebkitBoxOrient: "vertical" as const, WebkitLineClamp: b.maxLines, overflow: "hidden" }
                : {}),
            }}
          >
            {b.text}
          </p>
        ))}
      </div>
    </div>
  );
}
