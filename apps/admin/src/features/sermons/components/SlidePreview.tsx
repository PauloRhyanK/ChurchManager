import "../slide-identity.css";
import { SLIDE_FONT_STACK } from "../lib/slide-identity";
import { drawSlide } from "../lib/slide-layout";
import { PANEL, SLIDE_LAYOUTS, slideFace, type SlideFace, type SlideFaceInput, type SlideStyle } from "../lib/slides";

type Size = "sm" | "md" | "lg";
/** Largura do cartão (px) em cada tamanho. */
const SIZES: Record<Size, number> = { sm: 168, md: 288, lg: 480 };

/** Slide já no formato da tela (PublicSlide) ou ainda por montar (item do editor, cópia antiga só com kind/text/reference). */
export type PreviewSlide = SlideFace | (SlideFaceInput & { title?: string });

function toFace(slide: PreviewSlide): SlideFace {
  const s = slide as Partial<SlideFace> & Partial<SlideFaceInput>;
  if (typeof s.title === "string" && s.layout && SLIDE_LAYOUTS.includes(s.layout)) {
    return { layout: s.layout, title: s.title, verse: s.verse ?? null, reference: s.reference ?? null, items: s.items ?? null, start: s.start ?? null };
  }
  // Item do editor ou cópia antiga (modelos M01–M04): o padrão do tipo, com o título antigo como heading.
  const input = slide as SlideFaceInput & { title?: string };
  return slideFace({ ...input, heading: input.heading ?? input.title ?? null });
}

interface SlidePreviewProps {
  slide: PreviewSlide;
  style: SlideStyle;
  size?: Size;
}

/** Cartão 16:9 do slide como o telão vai mostrar: desenhado em 1920×1080 por drawSlide e reduzido em escala. */
export function SlidePreview({ slide, style, size = "md" }: SlidePreviewProps) {
  const drawing = drawSlide(toFace(slide), style);
  const { theme } = drawing;
  const width = SIZES[size];
  return (
    <div
      data-testid="slide-card"
      className="relative shrink-0 overflow-hidden rounded-md"
      style={{ width, maxWidth: "100%", aspectRatio: "16 / 9", backgroundColor: theme.background }}
    >
      <div
        data-testid="slide-frame"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: `${PANEL.canvas.width}px`,
          height: `${PANEL.canvas.height}px`,
          transform: `scale(${width / PANEL.canvas.width})`,
          transformOrigin: "top left",
          overflow: "hidden",
          fontFamily: SLIDE_FONT_STACK,
          color: theme.text,
        }}
      >
        {drawing.shapes.map((s) => (
          <div
            key={s.role}
            data-slide-role={s.role}
            style={{
              position: "absolute",
              left: s.x,
              top: s.y,
              width: s.width,
              height: s.height,
              boxSizing: "border-box",
              borderRadius: s.radius,
              backgroundColor: theme[s.fill],
              border: s.border ? `${s.border.width}px solid ${theme[s.border.color]}` : undefined,
            }}
          />
        ))}
        {drawing.texts.map((t, i) => (
          <div
            key={i}
            data-slide-role={t.role}
            style={{
              position: "absolute",
              left: t.x,
              top: t.y,
              width: t.width,
              height: t.height,
              fontSize: `${t.fontSize}px`,
              fontWeight: t.weight,
              color: theme[t.color],
              lineHeight: `${t.lineHeight}px`,
              letterSpacing: t.letterSpacing ? `${t.letterSpacing}px` : undefined,
              textAlign: t.align,
              whiteSpace: "pre",
            }}
          >
            {t.lines.map((line, j) => (
              <div key={j}>
                {line.map((run, k) =>
                  run.color === t.color && run.weight === t.weight ? (
                    run.text
                  ) : (
                    <span key={k} style={{ color: theme[run.color], fontWeight: run.weight }}>
                      {run.text}
                    </span>
                  ),
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
