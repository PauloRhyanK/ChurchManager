import { Check } from "lucide-react";

export const STEPS = ["Letra", "Áudio e tempo", "Climas", "Prévia"] as const;

interface StepTrailProps {
  current: number;
  /** Passos já completos (1 a 4), para o visto verde. */
  done: number[];
  onGo: (step: number) => void;
}

/** Trilha dos 4 passos no topo do editor. Todos clicáveis: não há ordem obrigatória. */
export function StepTrail({ current, done, onGo }: StepTrailProps) {
  return (
    <ol className="flex flex-wrap items-center gap-2.5">
      {STEPS.map((name, i) => {
        const n = i + 1;
        const isCurrent = n === current;
        const isDone = !isCurrent && done.includes(n);
        return (
          <li key={name} className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => onGo(n)}
              aria-current={isCurrent ? "step" : undefined}
              className="flex min-h-9 items-center gap-2.5 rounded-lg pr-1 hover:opacity-80"
            >
              <span
                className={
                  isDone
                    ? "flex h-7 w-7 items-center justify-center rounded-full border-2 border-green-800 bg-green-800 text-white"
                    : isCurrent
                      ? "flex h-7 w-7 items-center justify-center rounded-full border-2 border-primary bg-primary text-[13px] font-bold text-primary-foreground"
                      : "flex h-7 w-7 items-center justify-center rounded-full border-2 border-input bg-background text-[13px] font-bold text-muted-foreground"
                }
              >
                {isDone ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-label="feito" /> : n}
              </span>
              <span className={isCurrent ? "font-bold" : "font-medium text-muted-foreground"}>{name}</span>
            </button>
            {n < STEPS.length && <span aria-hidden="true" className="h-0.5 w-8 bg-input" />}
          </li>
        );
      })}
    </ol>
  );
}
