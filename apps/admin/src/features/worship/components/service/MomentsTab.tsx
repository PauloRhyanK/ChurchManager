import { BookOpen, ChevronRight, Music } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ServicePlan } from "../../api/worship-api";
import { MAX_MOMENTS } from "../../lib/moments";
import { MomentsEditor, type MomentDraft } from "./MomentsEditor";
import { SermonPreviewDialog } from "./SermonPreviewDialog";

export type { MomentDraft } from "./MomentsEditor";

interface MomentsTabProps {
  service: ServicePlan;
  canEdit: boolean;
  saving: boolean;
  onSave: (moments: MomentDraft[]) => void;
  onOpenWorship: () => void;
}

/** Aba "Culto inteiro": os momentos do culto, com o atalho das músicas e a palavra. */
export function MomentsTab({ service, canEdit, saving, onSave, onOpenWorship }: MomentsTabProps) {
  const firstWorship = service.moments.find((m) => m.kind === "WORSHIP")?.id;
  const firstSermon = service.moments.find((m) => m.kind === "SERMON")?.id;
  const sermon = service.sermon;
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {sermon && !firstSermon && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-sm">
          <span>Este culto tem uma palavra, mas o roteiro não tem o momento Palavra.</span>
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              disabled={saving || service.moments.length >= MAX_MOMENTS}
              onClick={() =>
                onSave([
                  ...service.moments.map((m) => ({ id: m.id, name: m.name, kind: m.kind, durationMinutes: m.durationMinutes })),
                  { name: "Palavra", kind: "SERMON", durationMinutes: 40 },
                ])
              }
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
        emptyText="Este culto não tem momentos."
        footer={`${service.moments.length} ${service.moments.length === 1 ? "momento" : "momentos"} · termina às ${service.endsAt}`}
        durationNote={(moment) =>
          moment.id === firstSermon && sermon && sermon.estimatedMinutes >= 1 ? (
            <span className="whitespace-nowrap">· palavra estimada em {sermon.estimatedMinutes}</span>
          ) : null
        }
        rowExtra={(moment) => (
          <>
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
            {moment.id === firstSermon && sermon && (
              <button
                type="button"
                title={`Palavra de ${sermon.preacherName}`}
                onClick={() => setPreviewOpen(true)}
                className="inline-flex min-w-0 max-w-[40%] flex-none items-center gap-1.5 rounded-lg bg-purple-100 px-3 py-1.5 text-sm font-semibold text-purple-700 hover:bg-purple-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
