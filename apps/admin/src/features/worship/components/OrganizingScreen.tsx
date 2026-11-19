import { Check, Sparkles } from "lucide-react";

interface OrganizingScreenProps {
  steps: string[];
  /** Índice do passo em andamento. */
  current: number;
}

/** Tela de carregamento: lista só o que está sendo feito de verdade. */
export function OrganizingScreen({ steps, current }: OrganizingScreenProps) {
  const progress = Math.round(((current + 0.5) / steps.length) * 100);
  return (
    <div role="status" aria-live="polite" className="mx-auto flex w-full max-w-md flex-col gap-7 py-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Sparkles className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-2 text-xl font-bold">Organizando a música</h1>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
      </div>
      <ol className="flex flex-col gap-3.5">
        {steps.map((label, i) => (
          <li key={label} className="flex items-center gap-3.5">
            {i < current ? (
              <span aria-hidden="true" className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-green-800 text-white">
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              </span>
            ) : i === current ? (
              <span aria-hidden="true" className="h-6 w-6 flex-none animate-spin rounded-full border-[3px] border-primary/25 border-t-primary" />
            ) : (
              <span aria-hidden="true" className="h-6 w-6 flex-none rounded-full border-2 border-input" />
            )}
            <span className={i === current ? "text-[15px] font-bold" : i > current ? "text-[15px] text-muted-foreground" : "text-[15px] font-medium"}>
              {label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
