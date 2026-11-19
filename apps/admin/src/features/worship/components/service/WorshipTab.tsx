import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { ServicePlan } from "../../api/worship-api";
import { formatClock } from "../../lib/format";
import { situationOf } from "../../lib/labels";
import { SortableList } from "./SortableList";

interface WorshipTabProps {
  service: ServicePlan;
  canEdit: boolean;
  saving: boolean;
  onSave: (songIds: string[]) => void;
  onAdd: () => void;
}

export function WorshipTab({ service, canEdit, saving, onSave, onAdd }: WorshipTabProps) {
  const items = service.songs.map((s) => ({ ...s, key: s.entryId }));
  const worship = service.moments.find((m) => m.kind === "WORSHIP");
  const notReady = service.songs.filter((s) => s.status !== "READY").length;

  return (
    <div className="flex flex-col gap-4">
      {items.length === 0 ? (
        <p className="rounded-xl border px-5 py-8 text-center text-sm text-muted-foreground">
          Nenhuma música no louvor deste culto ainda.
        </p>
      ) : (
        <SortableList
          items={items}
          disabled={!canEdit || saving}
          labelOf={(s) => s.title}
          onReorder={(next) => onSave(next.map((s) => s.id))}
          renderItem={(song, index) => {
            const situation = situationOf(song.status, song.pending);
            const step = song.pending.includes("AUDIO") || song.pending.includes("TIMES") ? 2 : song.pending.includes("MOODS") ? 3 : song.status === "DRAFT" ? 1 : 4;
            return (
              <>
                <span className="w-6 flex-none text-right text-sm tabular-nums text-muted-foreground">{index + 1}</span>
                <Link to={`/cultos/musicas/${song.id}`} className="min-w-0 flex-1 truncate text-[15px] font-semibold hover:underline">
                  {song.title}
                </Link>
                {song.status !== "READY" && (
                  <Link
                    to={`/cultos/musicas/${song.id}${step > 1 ? `?passo=${step}` : ""}`}
                    className="inline-flex flex-none items-center gap-1.5 rounded-lg bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-900 hover:bg-amber-200"
                  >
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    {situation.label}
                  </Link>
                )}
                <span className="w-12 flex-none text-right text-sm tabular-nums text-muted-foreground">
                  {song.audio?.durationSeconds ? formatClock(song.audio.durationSeconds) : "–"}
                </span>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Tirar ${song.title} do roteiro`}
                    disabled={saving}
                    onClick={() => onSave(service.songs.filter((s) => s.entryId !== song.entryId).map((s) => s.id))}
                    className="flex-none text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </>
            );
          }}
        />
      )}
      {notReady > 0 && (
        <p className="text-[13px] text-amber-900">
          {notReady === 1 ? "1 música ainda não está pronta" : `${notReady} músicas ainda não estão prontas`}: no culto,
          só as prontas passam sozinhas.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {canEdit ? (
          <Button variant="outline" className="gap-2" disabled={saving || service.songs.length >= 60} onClick={onAdd}>
            <Plus className="h-4 w-4" />
            Adicionar música
          </Button>
        ) : (
          <span />
        )}
        <span className="text-sm text-muted-foreground">
          {items.length} {items.length === 1 ? "música" : "músicas"}
          {worship ? ` · ${worship.effectiveMinutes} min` : ""}
          {service.worshipStartsAt ? ` · começa às ${service.worshipStartsAt}` : ""}
        </span>
      </div>
    </div>
  );
}
