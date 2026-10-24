import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { usePermissions } from "@/features/access/hooks/use-permissions";
import { DiscardChangesDialog } from "@/features/church/components/DiscardChangesDialog";
import { todayDateInputMin } from "@/features/events/lib/event-form-validation";
import {
  fetchProjectionAgenda,
  updateProjectionSettings,
  type ProjectionAgendaItem,
} from "@/features/site/api/projection-api";
import { getApiErrorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { isTopicIncomplete, toTopicDraft, type TopicDraft } from "./projection-topics";
import { ProjectionTopicsEditor } from "./ProjectionTopicsEditor";
import type { ChurchTab } from "./site-flow-blocks";

interface Hidden {
  events: Set<string>;
  schedules: Set<string>;
}

function hiddenFrom(items: ProjectionAgendaItem[]): Hidden {
  const hidden: Hidden = { events: new Set(), schedules: new Set() };
  for (const item of items) {
    if (item.hidden) (item.kind === "event" ? hidden.events : hidden.schedules).add(item.sourceId);
  }
  return hidden;
}

function sameSet(a: Set<string>, b: Set<string>) {
  return a.size === b.size && [...a].every((id) => b.has(id));
}

/** Só o que vai para a API, na ordem: compara rascunho com o salvo. */
function topicsPayload(topics: TopicDraft[]) {
  return topics.map(({ key: _key, ...topic }) => ({
    ...topic,
    callToAction: topic.callToAction?.trim() ? topic.callToAction : null,
  }));
}

function isHidden(hidden: Hidden, item: ProjectionAgendaItem) {
  return (item.kind === "event" ? hidden.events : hidden.schedules).has(item.sourceId);
}

/** "Hoje", "Amanhã" ou "terça-feira, 27 de out.". */
function dayLabel(date: string): string {
  const today = todayDateInputMin();
  const noon = (iso: string) => new Date(`${iso}T12:00:00`);
  const diffDays = Math.round((noon(date).getTime() - noon(today).getTime()) / 86_400_000);
  if (diffDays === 0) return "Hoje";
  if (diffDays === 1) return "Amanhã";
  return noon(date).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "short" });
}

interface ProjectionAgendaSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGoToTab: (tab: ChurchTab) => void;
}

/**
 * Prévia da agenda do telão (`/projecao-agenda`): programação semanal dos
 * próximos dias e eventos publicados, com o que fica de fora.
 */
export function ProjectionAgendaSheet({ open, onOpenChange, onGoToTab }: ProjectionAgendaSheetProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canEdit = can("SITE", "EDIT");
  const [draft, setDraft] = useState<Hidden | null>(null);
  const [topicsDraft, setTopicsDraft] = useState<TopicDraft[] | null>(null);
  const [confirm, setConfirm] = useState<(() => void) | null>(null);

  const agendaQuery = useQuery({
    queryKey: ["projection-agenda"],
    queryFn: fetchProjectionAgenda,
    enabled: open,
    // A agenda muda com edições em Agenda Semanal e Eventos: cada abertura busca de novo.
    staleTime: 0,
  });
  const items = agendaQuery.data?.items;

  // O rascunho nasce no primeiro clique, a partir do que está salvo; fechar o descarta.
  // Um refetch com o painel aberto não mexe nele.
  useEffect(() => {
    if (!open) {
      setDraft(null);
      setTopicsDraft(null);
    }
  }, [open]);

  const saved = items ? hiddenFrom(items) : null;
  const current = draft ?? saved;
  const hiddenDirty =
    draft !== null &&
    saved !== null &&
    (!sameSet(draft.events, saved.events) || !sameSet(draft.schedules, saved.schedules));

  const savedTopics = agendaQuery.data?.topics;
  const topics = topicsDraft ?? (savedTopics ?? []).map(toTopicDraft);
  const topicsDirty =
    topicsDraft !== null &&
    JSON.stringify(topicsPayload(topicsDraft)) !==
      JSON.stringify(topicsPayload((savedTopics ?? []).map(toTopicDraft)));
  const topicsIncomplete = topics.some(isTopicIncomplete);
  const dirty = hiddenDirty || topicsDirty;

  const saveMutation = useMutation({
    mutationFn: () =>
      updateProjectionSettings({
        hiddenEventIds: [...current!.events],
        hiddenScheduleIds: [...current!.schedules],
        topics: topicsPayload(topics),
      }),
    onSuccess: (agenda) => {
      queryClient.setQueryData(["projection-agenda"], agenda);
      toast.success("Agenda do telão salva.");
      onOpenChange(false);
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const toggle = (item: ProjectionAgendaItem) =>
    setDraft((prev) => {
      const base = prev ?? saved;
      if (!base) return prev;
      const next = { events: new Set(base.events), schedules: new Set(base.schedules) };
      const set = item.kind === "event" ? next.events : next.schedules;
      if (set.has(item.sourceId)) set.delete(item.sourceId);
      else set.add(item.sourceId);
      return next;
    });

  // Sair com alteração pendente pede confirmação.
  const leave = (then: () => void) => {
    if (dirty) setConfirm(() => then);
    else then();
  };
  const close = () => leave(() => onOpenChange(false));

  const groups = new Map<string, ProjectionAgendaItem[]>();
  for (const item of items ?? []) {
    groups.set(item.date, [...(groups.get(item.date) ?? []), item]);
  }

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle>Agenda do telão</SheetTitle>
            <SheetDescription>
              Programação semanal dos próximos {agendaQuery.data?.days ?? 7} dias e eventos
              publicados, na ordem em que aparecem na tela de projeção.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {agendaQuery.isPending ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : agendaQuery.isError ? (
              <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                Não foi possível carregar a agenda do telão.
              </p>
            ) : groups.size === 0 ? (
              <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                Nada na agenda dos próximos dias.
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Desligar um horário da programação semanal vale para todas as semanas.
                </p>
                {[...groups.entries()]
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([date, dayItems]) => {
                  const label = dayLabel(date);
                  return (
                    <div key={date} role="group" aria-label={label} className="space-y-1.5">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {label}
                      </h3>
                      <ul className="divide-y rounded-lg border">
                        {dayItems.map((item) => {
                          const shown = current ? !isHidden(current, item) : !item.hidden;
                          return (
                            <li key={item.key} className="flex items-center gap-3 px-3 py-2.5">
                              <span className="w-14 shrink-0 text-sm tabular-nums text-muted-foreground">
                                {item.timeStart ?? "Dia todo"}
                              </span>
                              <div className={cn("min-w-0 flex-1", !shown && "opacity-50")}>
                                <p className="truncate text-sm font-medium">{item.title}</p>
                                <Badge variant="secondary" className="mt-0.5 font-normal">
                                  {item.kind === "event" ? "Evento" : "Programação semanal"}
                                </Badge>
                              </div>
                              <Switch
                                checked={shown}
                                disabled={!canEdit || saveMutation.isPending}
                                onCheckedChange={() => toggle(item)}
                                aria-label={`Mostrar ${item.title} (${label}) no telão`}
                              />
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </>
            )}

            {agendaQuery.isSuccess && (
              <ProjectionTopicsEditor
                topics={topics}
                onChange={setTopicsDraft}
                disabled={!canEdit || saveMutation.isPending}
              />
            )}

            {(can("CHURCH", "VIEW") || can("EVENTS", "VIEW")) && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {can("CHURCH", "VIEW") && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                    onClick={() =>
                      leave(() => {
                        onOpenChange(false);
                        onGoToTab("agenda");
                      })
                    }
                  >
                    Editar na Agenda Semanal
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
                {can("EVENTS", "VIEW") && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                    onClick={() =>
                      leave(() => {
                        onOpenChange(false);
                        navigate("/eventos");
                      })
                    }
                  >
                    Abrir Eventos
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
          </div>

          <SheetFooter className="flex-row justify-end gap-2 border-t px-6 py-3">
            <Button type="button" variant="outline" disabled={saveMutation.isPending} onClick={close}>
              {canEdit ? "Cancelar" : "Fechar"}
            </Button>
            {canEdit && (
              <Button
                type="button"
                disabled={!dirty || topicsIncomplete || saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <DiscardChangesDialog
        open={confirm !== null}
        onOpenChange={(next) => !next && setConfirm(null)}
        onDiscard={() => {
          const then = confirm;
          setConfirm(null);
          setDraft(null);
          setTopicsDraft(null);
          then?.();
        }}
      />
    </>
  );
}
