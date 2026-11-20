// Imagem PNG 1920×1080 de um slide, para a Ponte do Culto. O desenho é o mesmo `drawSlide` da prévia
// (SlidePreview) e do .pptx; aqui ele vai para um <canvas> depois que a Montserrat carrega.
import "../slide-identity.css";
import { SLIDE_FONT, SLIDE_FONT_STACK, type SlideTheme } from "./slide-identity";
import { drawSlide, roleColor, toFace, type PreviewSlide, type SlideDrawing, type TextBox, type TextRun } from "./slide-layout";
import { PANEL, type SlideStyle } from "./slides";

/** O pedaço do contexto 2D que o desenho usa (os testes passam um gravador). */
export interface Paint2D {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  /** Ausente em navegadores antigos: aí as letras são desenhadas uma a uma. */
  letterSpacing?: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  roundRect?(x: number, y: number, w: number, h: number, radii: number): void;
  moveTo(x: number, y: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number; fontBoundingBoxAscent?: number; fontBoundingBoxDescent?: number };
}

/** Métricas verticais da Montserrat (hhea, em em), para quando o navegador não informa as da fonte. */
const MONTSERRAT_METRICS = { ascent: 0.968, descent: 0.251 } as const;
const WEIGHTS = [500, 600, 700, 800] as const;

const fontOf = (weight: number, size: number) => `${weight} ${size}px ${SLIDE_FONT_STACK}`;

function roundedRect(ctx: Paint2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, radius);
    return;
  }
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Largura de um trecho com o espaço entre letras (como no CSS, também depois da última). */
function runWidth(ctx: Paint2D, text: string, spacing: number, native: boolean): number {
  if (native || !spacing) return ctx.measureText(text).width;
  return Array.from(text).reduce((w, ch) => w + ctx.measureText(ch).width + spacing, 0);
}

function paintLine(ctx: Paint2D, box: TextBox, line: TextRun[], top: number, theme: SlideTheme) {
  const spacing = box.letterSpacing;
  const native = "letterSpacing" in ctx;
  if (native) ctx.letterSpacing = `${spacing}px`;
  const widths = line.map((run) => {
    ctx.font = fontOf(run.weight, box.fontSize);
    return runWidth(ctx, run.text, spacing, native);
  });
  const total = widths.reduce((a, b) => a + b, 0);
  // Linha mais larga que a caixa: o CSS alinha ao início.
  const free = Math.max(0, box.width - total);
  let x = box.align === "left" ? box.x : box.align === "right" ? box.x + free : box.x + free / 2;

  // Linha de base como no CSS: meia entrelinha acima da área da fonte (ascendente + descendente).
  ctx.font = fontOf(box.weight, box.fontSize);
  const m = ctx.measureText(line.map((r) => r.text).join("") || " ");
  const ascent = m.fontBoundingBoxAscent ?? MONTSERRAT_METRICS.ascent * box.fontSize;
  const descent = m.fontBoundingBoxDescent ?? MONTSERRAT_METRICS.descent * box.fontSize;
  const baseline = top + (box.lineHeight - (ascent + descent)) / 2 + ascent;

  line.forEach((run, i) => {
    ctx.font = fontOf(run.weight, box.fontSize);
    ctx.fillStyle = roleColor(theme, run.color);
    if (native || !spacing) {
      ctx.fillText(run.text, x, baseline);
    } else {
      let cx = x;
      for (const ch of Array.from(run.text)) {
        ctx.fillText(ch, cx, baseline);
        cx += ctx.measureText(ch).width + spacing;
      }
    }
    x += widths[i];
  });
}

/** Desenha o slide (já calculado por `drawSlide`) numa tela 1920×1080: fundo, formas e textos, na ordem da prévia. */
export function paintSlide(ctx: Paint2D, drawing: SlideDrawing, theme: SlideTheme = drawing.theme): void {
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, PANEL.canvas.width, PANEL.canvas.height);

  for (const s of drawing.shapes) {
    // box-sizing: border-box; o fundo vai até a borda de fora e a borda é desenhada por dentro.
    roundedRect(ctx, s.x, s.y, s.width, s.height, s.radius);
    ctx.fillStyle = roleColor(theme, s.fill);
    ctx.fill();
    if (s.border && s.border.width > 0) {
      const b = s.border.width;
      roundedRect(ctx, s.x + b / 2, s.y + b / 2, s.width - b, s.height - b, s.radius - b / 2);
      ctx.strokeStyle = roleColor(theme, s.border.color);
      ctx.lineWidth = b;
      ctx.stroke();
    }
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  for (const box of drawing.texts) {
    box.lines.forEach((line, j) => paintLine(ctx, box, line, box.y + j * box.lineHeight, theme));
  }
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
}

/** Texto de amostra para a carga cobrir o subconjunto latino (acentos, aspas e o marcador). */
const FONT_SAMPLE = "AaÁáçõ“”•0123";
const FONT_WAIT_MS = 10_000;

/**
 * Espera a Montserrat nos quatro pesos. A folha do Google Fonts chega depois do CSS: enquanto a fonte não está
 * registrada, `document.fonts.load` devolve vazio e a carga é tentada de novo. Sem a fonte, a imagem não é feita
 * (uma imagem com a fonte reserva iria para o telão).
 */
export async function loadSlideFonts(timeoutMs = FONT_WAIT_MS): Promise<void> {
  const fonts = document.fonts;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const loaded = await Promise.all(WEIGHTS.map((w) => fonts.load(`${w} 48px "${SLIDE_FONT}"`, FONT_SAMPLE)));
    if (loaded.every((faces) => faces.length > 0)) return;
    if (Date.now() >= deadline) throw new Error("A fonte dos slides não carregou.");
    await new Promise((r) => setTimeout(r, 250));
  }
}

/** PNG 1920×1080 do slide no estilo dado. */
export async function renderSlidePng(slide: PreviewSlide, style: SlideStyle): Promise<Blob> {
  await loadSlideFonts();
  const canvas = document.createElement("canvas");
  canvas.width = PANEL.canvas.width;
  canvas.height = PANEL.canvas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Este navegador não desenha imagens.");
  paintSlide(ctx, drawSlide(toFace(slide), style));
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Não foi possível gerar a imagem do slide."))), "image/png");
  });
}
