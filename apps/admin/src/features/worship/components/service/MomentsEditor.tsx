import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { MomentKind } from "../../api/worship-api";
import { MAX_MOMENTS, MOMENT_KINDS, MOMENT_KIND_LABEL } from "../../lib/moments";
import { SortableList } from "./SortableList";

export interface MomentDraft {
  id?: string;
  name: string;
  kind: MomentKind;
  durationMinutes: number;
}

/** Um momento na tela: o que se edita mais o horário já calculado. */
export interface EditorMoment {
  id: string;
  name: string;
  kind: MomentKind;
  durationMinutes: number;
  startsAt: string;
  /** Diferente de `durationMinutes` quando a duração é calculada (louvor pela soma dos áudios). */
  effectiveMinutes: number;
}

interface MomentsEditorProps {
  moments: EditorMoment[];
  canEdit: boolean;
  /** Trava a lista enquanto uma alteração está sendo gravada. */
  saving?: boolean;
  /** Recebe a lista inteira, na ordem, a cada alteração. */
  onSave: (moments: MomentDraft[]) => void;
  /** Mostra o seletor de tipo em cada linha (modelos). */
  showKind?: boolean;
  /** Texto depois da duração de uma linha (ex.: a palavra estimada). */
  durationNote?: (moment: EditorMoment) => ReactNode;
  /** Botões à direita de uma linha, antes do remover (ex.: "4 músicas"). */
  rowExtra?: (moment: EditorMoment) => ReactNode;
  emptyText: string;
  /** Rodapé à direita (ex.: "7 momentos · termina às 20:17"). */
  footer: ReactNode;
}

const toDraft = (m: EditorMoment): MomentDraft => ({
  id: m.id,
  name: m.name,
  kind: m.kind,
  durationMinutes: m.durationMinutes,
});

/** Nome e duração de um momento: confirma ao sair do campo, se mudou e é válido. */
function MomentFields({
  moment,
  canEdit,
  note,
  onCommit,
}: {
  moment: EditorMoment;
  canEdit: boolean;
  note: ReactNode;
  onCommit: (patch: Partial<MomentDraft>) => void;
}) {
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
          {note}
        </label>
      )}
    </>
  );
}

/**
 * A lista de momentos de um culto ou de um modelo: acrescentar, renomear,
 * mudar duração (e tipo, nos modelos), remover e arrastar para reordenar.
 */
export function MomentsEditor({
  moments,
  canEdit,
  saving = false,
  onSave,
  showKind = false,
  durationNote,
  rowExtra,
  emptyText,
  footer,
}: MomentsEditorProps) {
  const drafts = moments.map(toDraft);
  const items = moments.map((m) => ({ ...m, key: m.id }));
  const patch = (index: number, change: Partial<MomentDraft>) =>
    onSave(drafts.map((d, i) => (i === index ? { ...d, ...change } : d)));

  return (
    <div className="flex flex-col gap-4">
      {items.length === 0 ? (
        <p className="rounded-xl border px-5 py-8 text-center text-sm text-muted-foreground">{emptyText}</p>
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
                note={durationNote?.(moment)}
                onCommit={(change) => patch(index, change)}
              />
              {showKind && (
                <select
                  aria-label={`Tipo de ${moment.name}`}
                  value={moment.kind}
                  disabled={!canEdit || saving}
                  onChange={(e) => patch(index, { kind: e.target.value as MomentKind })}
                  className="h-9 flex-none rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {MOMENT_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {MOMENT_KIND_LABEL[kind]}
                    </option>
                  ))}
                </select>
              )}
              {rowExtra?.(moment)}
              {canEdit && (
                <Button
                  type="button"
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
            type="button"
            variant="outline"
            className="gap-2"
            disabled={saving || drafts.length >= MAX_MOMENTS}
            onClick={() => onSave([...drafts, { name: "Novo momento", kind: "GENERIC", durationMinutes: 5 }])}
          >
            <Plus className="h-4 w-4" />
            Adicionar momento
          </Button>
        ) : (
          <span />
        )}
        <span className="text-sm text-muted-foreground">{footer}</span>
      </div>
    </div>
  );
}
