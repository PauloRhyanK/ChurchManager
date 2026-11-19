import { cn } from "@/lib/utils";
import type { DerivedSermon } from "../lib/document";

interface StructurePanelProps {
  derived: DerivedSermon;
  /** Id da seção onde está o cursor; nulo na Abertura. */
  activeId: string | null;
  /** Id do bloco que abre a seção; nulo para a Abertura (topo da folha). */
  onSelect(id: string | null): void;
  className?: string;
}

/** Estrutura do sermão: seções com o tempo de fala e os versículos citados. */
export function StructurePanel({ derived, activeId, onSelect, className }: StructurePanelProps) {
  const { sections, verses } = derived;
  return (
    <nav aria-label="Estrutura do sermão" className={cn("text-sm", className)}>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#6B7280]">Estrutura</h2>
      {sections.length === 0 ? (
        <p className="text-[#6B7280]">A estrutura aparece conforme você escreve.</p>
      ) : (
        <ul className="space-y-0.5">
          {sections.map((section) => {
            const active = section.id === activeId;
            const label = section.number !== null ? `${section.number}. ${section.title}` : section.title;
            return (
              <li key={section.id ?? "opening"}>
                <button
                  type="button"
                  aria-current={active ? "true" : undefined}
                  onClick={() => onSelect(section.id)}
                  className={cn(
                    "flex w-full items-baseline justify-between gap-3 rounded-md px-2.5 py-2 text-left hover:bg-white",
                    active && "bg-white font-semibold text-[#030712] shadow-sm",
                  )}
                >
                  <span className="min-w-0 truncate">{label}</span>
                  <span className="shrink-0 text-xs text-[#6B7280]">{section.minutes} min</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {verses.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
            Versículos · {verses.length}
          </h3>
          <ul className="space-y-1 text-[#1F2937]">
            {verses.map((v) => (
              <li key={v.id} className="px-2.5">
                {v.reference}
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  );
}
