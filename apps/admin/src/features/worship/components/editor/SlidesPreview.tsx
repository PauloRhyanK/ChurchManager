import { useEffect, useRef } from "react";
import type { DerivedSlide } from "../../lib/document";
import { revealInside } from "../../lib/scroll";

interface SlidesPreviewProps {
  slides: DerivedSlide[];
  /** Índice do slide onde está o cursor (-1: nenhum). */
  selected: number;
}

/** Miniaturas dos slides como vão para o telão. */
export function SlidesPreview({ slides, selected }: SlidesPreviewProps) {
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
          <div
            key={s.rowId}
            data-slide={s.index}
            className={`flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-[#05070B] p-1.5 ${
              s.index === selected ? "outline outline-[3px] outline-offset-2 outline-primary" : ""
            }`}
          >
            {s.lines.length ? (
              <span className="whitespace-pre-line text-center text-[10px] font-bold leading-tight text-[#F5F6FA]">
                {s.lines.join("\n")}
              </span>
            ) : (
              <span className="text-center text-[10px] italic text-white/50">sem letra</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
