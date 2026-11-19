import { AlertTriangle, BookOpen, Music } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { ServiceMoment, ServicePlan } from "../../api/worship-api";
import { formatClock } from "../../lib/format";
import { MOOD_META, situationOf } from "../../lib/labels";
import { MAX_MOMENTS } from "../../lib/moments";
import { MomentsEditor, type MomentDraft } from "./MomentsEditor";
import { SermonPreviewDialog } from "./SermonPreviewDialog";

export type { MomentDraft } from "./MomentsEditor";

interface MomentsTabProps {
  service: ServicePlan;
  canEdit: boolean;
  saving: boolean;
  onSave: (moments: MomentDraft[]) => void;
  /** "+ Música": escolher uma música para pôr no fim do roteiro. */
  onAddSong: () => void;
  /** Escolher a música de um espaço reservado. */
  onChooseSong: (momentId: string) => void;
  /** Bloco Louvor de antes, ainda sem músicas: escolher as músicas que entram no lugar dele. */
  onFillWorship: () => void;
}

const toDraft = (m: ServiceMoment): MomentDraft => ({
  id: m.id,
  name: m.name,
  kind: m.kind,
  durationMinutes: m.durationMinutes,
  songId: m.songId,
});

/** Tom, bpm e compasso, quando houver. */
function ficha(song: NonNullable<ServiceMoment["song"]>) {
  return [song.musicalKey ? `Tom ${song.musicalKey}` : null, song.bpm ? `${song.bpm} bpm` : null].filter(Boolean).join(" · ");
}

/** A linha de uma música no roteiro: faixa roxa, tom, bpm, clima e duração. */
function SongItem({
  moment,
  canEdit,
  saving,
  onChoose,
}: {
  moment: ServiceMoment;
  canEdit: boolean;
  saving: boolean;
  onChoose: () => void;
}) {
  const song = moment.song;
  const icon = (
    <span aria-hidden="true" className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-primary text-primary-foreground">
      <Music className="h-4 w-4" />
    </span>
  );
  if (!song) {
    return (
      <>
        {icon}
        <span className="min-w-0 flex-1 text-[15px] font-semibold text-muted-foreground">Música a escolher</span>
        {canEdit && (
          <Button variant="outline" size="sm" disabled={saving} onClick={onChoose}>
            Escolher música
          </Button>
        )}
        <span className="w-14 flex-none text-right text-sm tabular-nums text-muted-foreground">{moment.effectiveMinutes} min</span>
      </>
    );
  }
  const mood = song.mood ? MOOD_META[song.mood] : null;
  const situation = situationOf(song.status, song.pending);
  const info = ficha(song);
  return (
    <>
      {icon}
      <span className="flex min-w-0 flex-1 flex-col">
        <Link to={`/cultos/musicas/${song.id}`} className="truncate text-[15px] font-semibold hover:underline">
          {song.title}
        </Link>
        {info && <span className="text-xs text-muted-foreground">{info}</span>}
      </span>
      {song.status !== "READY" && (
        <span
          title={situation.label}
          className="hidden flex-none items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200 sm:inline-flex"
        >
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          {situation.label}
        </span>
      )}
      {mood && (
        <span className="inline-flex flex-none items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">
          <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: mood.color }} />
          {mood.label}
        </span>
      )}
      <span className="w-14 flex-none text-right text-sm tabular-nums text-muted-foreground">
        {song.audio?.durationSeconds ? formatClock(song.audio.durationSeconds) : `${moment.effectiveMinutes} min`}
      </span>
    </>
  );
}

/** Aba "Culto inteiro": o roteiro na ordem, com momentos e músicas intercalados. */
export function MomentsTab({ service, canEdit, saving, onSave, onAddSong, onChooseSong, onFillWorship }: MomentsTabProps) {
  const firstSermon = service.moments.find((m) => m.kind === "SERMON")?.id;
  const firstWorship = service.moments.find((m) => m.kind === "WORSHIP")?.id;
  const sermon = service.sermon;
  const [previewOpen, setPreviewOpen] = useState(false);
  const drafts = service.moments.map(toDraft);
  const songCount = service.moments.filter((m) => m.kind === "SONG").length;
  const byId = new Map(service.moments.map((m) => [m.id, m]));

  return (
    <div className="flex flex-col gap-4">
      {sermon && !firstSermon && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-sm dark:border-purple-900 dark:bg-purple-950/40">
          <span>Este culto tem uma palavra, mas o roteiro não tem o momento Palavra.</span>
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              disabled={saving || service.moments.length >= MAX_MOMENTS}
              onClick={() => onSave([...drafts, { name: "Palavra", kind: "SERMON", durationMinutes: 40 }])}
            >
              Adicionar o momento Palavra
            </Button>
          )}
        </div>
      )}
      <MomentsEditor
        moments={service.moments}
        canEdit={canEdit}
        saving={saving}
        onSave={onSave}
        emptyText="Este culto ainda não tem nada no roteiro."
        footer={`${service.moments.length} ${service.moments.length === 1 ? "item" : "itens"} · ${songCount} ${songCount === 1 ? "música" : "músicas"} · termina às ${service.endsAt}`}
        onAddSong={canEdit ? onAddSong : undefined}
        renderSong={(moment) => {
          const full = byId.get(moment.id);
          return full ? (
            <SongItem
              moment={full}
              canEdit={canEdit}
              saving={saving}
              onChoose={() => onChooseSong(moment.id)}
            />
          ) : null;
        }}
        durationNote={(moment) =>
          moment.id === firstSermon && sermon && sermon.estimatedMinutes >= 1 ? (
            <span className="whitespace-nowrap">· palavra estimada em {sermon.estimatedMinutes}</span>
          ) : null
        }
        rowExtra={(moment) => (
          <>
            {moment.id === firstWorship && songCount === 0 && canEdit && (
              <button
                type="button"
                onClick={onFillWorship}
                className="inline-flex flex-none items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary/15"
              >
                <Music className="h-4 w-4" aria-hidden="true" />
                Escolher as músicas
              </button>
            )}
            {moment.id === firstSermon && sermon && (
              <button
                type="button"
                title={`Palavra de ${sermon.preacherName}`}
                onClick={() => setPreviewOpen(true)}
                className="inline-flex min-w-0 max-w-[40%] flex-none items-center gap-1.5 rounded-lg bg-purple-100 px-3 py-1.5 text-sm font-semibold text-purple-700 hover:bg-purple-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-purple-950/50 dark:text-purple-200"
              >
                <BookOpen className="h-4 w-4 flex-none" aria-hidden="true" />
                <span className="truncate">{sermon.title}</span>
              </button>
            )}
          </>
        )}
      />
      {sermon && <SermonPreviewDialog serviceId={service.id} open={previewOpen} onOpenChange={setPreviewOpen} />}
    </div>
  );
}
