import type { PartKind } from "./document";

export interface PartTone {
  /** Fundo do bloco da parte no texto. */
  block: string;
  /** Barra que marca do começo ao fim de cada slide. */
  bar: string;
  /** Nome da parte na margem. */
  label: string;
}

/** Cores suaves por tipo de parte, para o tema claro e o escuro. */
export const PART_TONE: Record<PartKind, PartTone> = {
  INTRO: { block: "bg-slate-100/80 dark:bg-slate-800/40", bar: "bg-slate-400", label: "text-slate-600 dark:text-slate-300" },
  VERSE: { block: "bg-sky-50 dark:bg-sky-950/40", bar: "bg-sky-400", label: "text-sky-700 dark:text-sky-300" },
  PRE_CHORUS: { block: "bg-violet-50 dark:bg-violet-950/40", bar: "bg-violet-400", label: "text-violet-700 dark:text-violet-300" },
  CHORUS: { block: "bg-rose-50 dark:bg-rose-950/40", bar: "bg-rose-400", label: "text-rose-700 dark:text-rose-300" },
  BRIDGE: { block: "bg-emerald-50 dark:bg-emerald-950/40", bar: "bg-emerald-500", label: "text-emerald-700 dark:text-emerald-300" },
  INSTRUMENTAL: { block: "bg-zinc-100/80 dark:bg-zinc-800/40", bar: "bg-zinc-400", label: "text-zinc-600 dark:text-zinc-300" },
  ENDING: { block: "bg-indigo-50 dark:bg-indigo-950/40", bar: "bg-indigo-400", label: "text-indigo-700 dark:text-indigo-300" },
};
