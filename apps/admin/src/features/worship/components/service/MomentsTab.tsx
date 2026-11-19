import { ChevronRight, Music, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { MomentKind, ServiceMoment, ServicePlan } from "../../api/worship-api";
import { SortableList } from "./SortableList";

export interface MomentDraft {
  id?: string;
  name: string;
  kind: MomentKind;
  durationMinutes: number;
}

interface MomentsTabProps {
  service: ServicePlan;
  canEdit: boolean;
  saving: boolean;
  onSave: (moments: MomentDraft[]) => void;
  onOpenWorship: () => void;
}

const toDraft = (m: ServiceMoment): MomentDraft => ({
  id: m.id,
  name: m.name,
  kind: m.kind,
  durationMinutes: m.durationMinutes,
});

/** Nome e duração de um momento: salva ao sair do campo, se mudou e é válido. */
function MomentFields({ moment, canEdit, onCommit }: { moment: ServiceMoment; canEdit: boolean; onCommit: (patch: Partial<MomentDraft>) => void }) {
  const [name, setName] = useState(moment.name);
  const [minutes, setMinutes] = useState(String(moment.durationMinutes));
  useEffect(() => setName(moment.name), [moment.name]);
  useEffect(() => setMinutes(String(moment.durationMinutes)), [moment.durationMinutes]);

  const computed = moment.effectiveMinutes !== moment.durationMinutes;
  return (
    <>
      <input
        aria-label={`Nome do momento ${moment.name}`}
        value={name}
        maxLength={120}
        disabled={!canEdit}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const next = name.trim();
          if (!next) setName(moment.name);
          else if (next !== moment.name) onCommit({ name: next });
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-[15px] font-semibold hover:border-input focus:border-input focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {computed ? (
        <span className="flex-none text-sm tabular-nums text-muted-foreground" title="Soma dos áudios das músicas">
          {moment.effectiveMinutes} min
        </span>
      ) : (
        <label className="flex flex-none items-center gap-1.5 text-sm text-muted-foreground">
          <input
            aria-label={`Duração de ${moment.name} em minutos`}
            inputMode="numeric"
            value={minutes}
            disabled={!canEdit}
            onChange={(e) => setMinutes(e.target.value.replace(/\D/g, "").slice(0, 3))}
            onBlur={() => {
              const next = Number(minutes);
              if (!Number.isInteger(next) || next < 1 || next > 600) setMinutes(String(moment.durationMinutes));
              else if (next !== moment.durationMinutes) onCommit({ durationMinutes: next });
            }}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            className="w-12 rounded-md border border-transparent bg-transparent px-1.5 py-1.5 text-right tabular-nums text-foreground hover:border-input focus:border-input focus:outline-none focus:ring-2 focus:ring-ring"
          />
          min
        </label>
      )}
    </>
  );
}

export function MomentsTab({ service, canEdit, saving, onSave, onOpenWorship }: MomentsTabProps) {
  const drafts = service.moments.map(toDraft);
  const items = service.moments.map((m) => ({ ...m, key: m.id }));
  const firstWorship = service.moments.find((m) => m.kind === "WORSHIP")?.id;

  return (
    <div className="flex flex-col gap-4">
      {items.length === 0 ? (
        <p className="rounded-xl border px-5 py-8 text-center text-sm text-muted-foreground">Este culto não tem momentos.</p>
      ) : (
        <SortableList
          items={items}
          disabled={!canEdit || saving}
          labelOf={(m) => m.name}
          onReorder={(next) => onSave(next.map(toDraft))}
          renderItem={(moment, index) => (
            <>
              <span className="w-12 flex-none text-sm font-semibold tabular-nums">{moment.startsAt}</span>
              <MomentFields
                moment={moment}
                canEdit={canEdit && !saving}
                onCommit={(patch) => onSave(drafts.map((d, i) => (i === index ? { ...d, ...patch } : d)))}
              />
              {moment.id === firstWorship && (
                <button
                  type="button"
                  onClick={onOpenWorship}
                  className="inline-flex flex-none items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary/15"
                >
                  <Music className="h-4 w-4" aria-hidden="true" />
                  {service.songs.length} {service.songs.length === 1 ? "música" : "músicas"}
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remover ${moment.name}`}
                  disabled={saving}
                  onClick={() => onSave(drafts.filter((_, i) => i !== index))}
                  className="flex-none text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </>
          )}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {canEdit ? (
          <Button
            variant="outline"
            className="gap-2"
            disabled={saving || drafts.length >= 40}
            onClick={() => onSave([...drafts, { name: "Novo momento", kind: "GENERIC", durationMinutes: 5 }])}
          >
            <Plus className="h-4 w-4" />
            Adicionar momento
          </Button>
        ) : (
          <span />
        )}
        <span className="text-sm text-muted-foreground">
          {items.length} {items.length === 1 ? "momento" : "momentos"} · termina às {service.endsAt}
        </span>
      </div>
    </div>
  );
}
