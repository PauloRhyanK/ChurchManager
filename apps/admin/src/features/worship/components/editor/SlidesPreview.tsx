import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, WandSparkles } from "lucide-react";
import type { DerivedSlide } from "../../lib/document";
import { revealInside } from "../../lib/scroll";

interface SlidesPreviewProps {
  slides: DerivedSlide[];
  /** Índice do slide onde está o cursor (-1: nenhum). */
  selected: number;
  maxChars: number;
  maxLines: number;
  canEdit: boolean;
  onReflow: (rowId: string) => void;
}

/** Miniaturas dos slides como vão para o telão. */
export function SlidesPreview({ slides, selected, maxChars, maxLines, canEdit, onReflow }: SlidesPreviewProps) {
  const listRef = useRef<HTMLDivElement>(null);
  // Só quando o slide do cursor muda, e só dentro da lista: a página fica onde a pessoa deixou.
  useEffect(() => {
    if (selected < 0) return;
    revealInside(listRef.current, listRef.current?.querySelector<HTMLElement>(`[data-slide="${selected}"]`));
  }, [selected]);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2.5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Slides</h2>
        <span className="text-[13px] text-muted-foreground">
          {selected >= 0 ? `${selected + 1} de ${slides.length}` : slides.length}
        </span>
      </div>
      <div ref={listRef} className="grid max-h-[640px] grid-cols-2 gap-2.5 overflow-y-auto p-1">
        {slides.map((s) => (
          <article
            key={s.rowId}
            data-slide={s.index}
            data-over-limit={s.lines.length > maxLines || s.lines.some((line) => line.length > maxChars) || undefined}
            className={`flex flex-col gap-1.5 rounded-lg border p-1.5 ${
              s.lines.length > maxLines || s.lines.some((line) => line.length > maxChars) ? "border-amber-400 bg-amber-50/50" : "border-transparent"
            } ${
              s.index === selected ? "outline outline-[3px] outline-offset-2 outline-primary" : ""
            }`}
          >
            <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded bg-[#05070B] p-1.5">
              {s.lines.length ? (
                <span className="whitespace-pre-line text-center text-[10px] font-bold leading-tight text-[#F5F6FA]">
                  {s.lines.join("\n")}
                </span>
              ) : (
                <span className="text-center text-[10px] italic text-white/50">sem letra</span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              {(s.lines.length > maxLines || s.lines.some((line) => line.length > maxChars)) ? (
                <span role="status" className="flex items-center gap-1 text-[11px] font-medium text-amber-800">
                  <AlertTriangle className="h-3 w-3" />
                  {s.lines.length} linhas · {Math.max(0, ...s.lines.map((line) => line.length))} caracteres máx.
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground">{s.lines.length} {s.lines.length === 1 ? "linha" : "linhas"} · {Math.max(0, ...s.lines.map((line) => line.length))} caracteres máx.</span>
              )}
              {(s.lines.length > maxLines || s.lines.some((line) => line.length > maxChars)) && canEdit && <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11px]" onClick={() => onReflow(s.rowId)}>
                <WandSparkles className="h-3 w-3" />Ajustar quebra
              </Button>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
