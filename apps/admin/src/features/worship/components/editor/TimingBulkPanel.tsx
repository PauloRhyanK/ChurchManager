import { ChevronsLeft, ChevronsRight, Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { LearnedTiming } from "../../api/worship-api";
import { LEAD_LIMITS } from "../../lib/timing";

interface TimingBulkPanelProps {
  canEdit: boolean;
  lead: number;
  onLeadCommit: (lead: number) => void;
  savingLead: boolean;
  learned: LearnedTiming | undefined;
  /** Há tempos marcados para deslocar. */
  hasTimes: boolean;
  onShiftSlides: (direction: -1 | 1) => void;
  onShiftSeconds: (delta: number) => void;
}

const fmt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });

/** Ajustes que valem para a música inteira: antecipação e deslocamentos em massa. */
export function TimingBulkPanel({
  canEdit,
  lead,
  onLeadCommit,
  savingLead,
  learned,
  hasTimes,
  onShiftSlides,
  onShiftSeconds,
}: TimingBulkPanelProps) {
  const [draftLead, setDraftLead] = useState(lead);
  useEffect(() => setDraftLead(lead), [lead]);
  const [seconds, setSeconds] = useState("0,5");
  const amount = Number(seconds.replace(",", "."));
  const validAmount = Number.isFinite(amount) && amount > 0 && amount <= 30;

  const hint =
    learned && learned.meanFineDeltaSeconds !== null && learned.corrections > 0
      ? `Nas correções à mão desta igreja, os slides foram movidos em média ${fmt(learned.meanFineDeltaSeconds)} s.`
      : null;

  return (
    <section aria-label="Ajustes da música inteira" className="flex flex-col gap-5 rounded-xl border bg-card p-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="antecipacao" className="font-semibold">
            Antecipação na projeção
          </Label>
          <b className="tabular-nums">{fmt(draftLead)} s</b>
        </div>
        <Slider
          id="antecipacao"
          aria-label="Antecipação na projeção, em segundos"
          min={LEAD_LIMITS.min}
          max={LEAD_LIMITS.max}
          step={LEAD_LIMITS.step}
          value={[draftLead]}
          disabled={!canEdit || savingLead}
          onValueChange={([v]) => setDraftLead(v)}
          onValueCommit={([v]) => onLeadCommit(Math.round(v * 10) / 10)}
        />
        <p className="text-[13px] text-muted-foreground">
          Os tempos marcam quando a frase <b>começa</b> a ser cantada. Na tela, o slide entra este tanto antes, para a
          igreja ler a tempo. Vale para todas as músicas.
        </p>
      </div>

      {canEdit && (
        <div className="flex flex-col gap-2.5 border-t pt-4">
          <span className="font-semibold">Mover todos os slides</span>
          <div className="grid gap-2 xl:grid-cols-2">
            <Button variant="outline" className="h-auto justify-start gap-3 whitespace-normal py-2.5 text-left" disabled={!hasTimes} onClick={() => onShiftSlides(-1)}>
              <ChevronsLeft className="h-5 w-5 flex-none" />
              <span className="flex flex-col">
                <b>Voltar todos 1 slide</b>
                <span className="text-[12px] font-normal text-muted-foreground">Cada slide entra no tempo do anterior (mais cedo)</span>
              </span>
            </Button>
            <Button variant="outline" className="h-auto justify-start gap-3 whitespace-normal py-2.5 text-left" disabled={!hasTimes} onClick={() => onShiftSlides(1)}>
              <ChevronsRight className="h-5 w-5 flex-none" />
              <span className="flex flex-col">
                <b>Atrasar todos 1 slide</b>
                <span className="text-[12px] font-normal text-muted-foreground">Cada slide entra no tempo do seguinte (mais tarde)</span>
              </span>
            </Button>
          </div>
          <p className="text-[13px] text-muted-foreground">
            A música inteira ficou um slide atrasada (a letra aparece quando a frase seguinte começa)? Use{" "}
            <b>Voltar todos 1 slide</b>.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">Mover tudo</span>
            <Button variant="outline" size="sm" className="gap-1" disabled={!hasTimes || !validAmount} onClick={() => onShiftSeconds(-amount)}>
              <Minus className="h-3.5 w-3.5" />
              mais cedo
            </Button>
            <Input
              aria-label="Segundos para mover tudo"
              inputMode="decimal"
              className="h-9 w-20 text-center tabular-nums"
              value={seconds}
              onChange={(e) => setSeconds(e.target.value)}
            />
            <span className="text-sm">s</span>
            <Button variant="outline" size="sm" className="gap-1" disabled={!hasTimes || !validAmount} onClick={() => onShiftSeconds(amount)}>
              <Plus className="h-3.5 w-3.5" />
              mais tarde
            </Button>
          </div>
          {hint && <p className="text-[13px] text-muted-foreground">{hint}</p>}
        </div>
      )}
    </section>
  );
}
