import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, ArrowRight, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/features/access/hooks/use-permissions";
import { getApiErrorMessage } from "@/lib/api";
import { generateSlides, getSermon, saveSlides, type Sermon } from "../api/sermons-api";
import { GenerateSlidesDialog } from "../components/GenerateSlidesDialog";
import { SendToServiceDialog } from "../components/SendToServiceDialog";
import { SlideList } from "../components/SlideList";
import { SlidePreview } from "../components/SlidePreview";
import { formatSituation } from "../lib/format";
import { editSlide, moveSlide, slidesBody, toggleSlide } from "../lib/slide-edits";
import { publicSlides, type SlideItem, type SlideStyle } from "../lib/slides";

const LIST_PATH = "/palavras";
const STYLE_NAME: Record<SlideStyle, string> = { MINIMAL: "Minimalista", BACKGROUND: "Com fundo" };
const SAVE_ERROR = "Não foi possível salvar os slides.";
const REGENERATE_NOTICE = "Trocar o que mostrar refaz a sequência do zero.";

const plural = (n: number) => `${n} ${n === 1 ? "slide" : "slides"}`;
const detailKey = (id: string) => ["sermons", "detail", id] as const;

type Draft = { items: SlideItem[]; style: SlideStyle };

function SlidesView({ initial, canEdit }: { initial: Sermon; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const id = initial.id;
  const [sermon, setSermon] = useState(initial);
  const [draft, setDraft] = useState<Draft>({ items: initial.slides, style: initial.slideStyle });
  const [busy, setBusy] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  // Fila de salvamento: um pedido por vez; o que mudar no meio espera e vai inteiro no próximo.
  const pending = useRef<Draft | null>(null);
  const running = useRef<Promise<void> | null>(null);

  /** Guarda a palavra do servidor; a lista só é trocada quando não há mudança local esperando. */
  function adopt(saved: Sermon, withSlides: boolean) {
    setSermon(saved);
    if (withSlides) setDraft({ items: saved.slides, style: saved.slideStyle });
    queryClient.setQueryData<Sermon>(detailKey(id), saved);
    void queryClient.invalidateQueries({ queryKey: ["sermons", "list"] });
  }

  async function drain() {
    try {
      while (pending.current) {
        const next = pending.current;
        pending.current = null;
        try {
          const saved = await saveSlides(id, { style: next.style, items: slidesBody(next.items) });
          adopt(saved, pending.current === null);
        } catch {
          pending.current = null;
          toast.error(SAVE_ERROR);
          try {
            adopt(await getSermon(id), true);
          } catch {
            // Sem a cópia do servidor, a tela fica como está; o próximo salvamento tenta de novo.
          }
        }
      }
    } finally {
      running.current = null;
    }
  }

  function change(next: Draft) {
    setDraft(next);
    pending.current = next;
    if (!running.current) running.current = drain();
  }

  /** Espera a fila esvaziar (antes de gerar de novo ou enviar). */
  async function whenIdle() {
    while (running.current) await running.current;
    return true;
  }

  const { items, style } = draft;
  const shown = publicSlides(items);
  const readOnly = !canEdit || busy;

  async function refresh() {
    setBusy(true);
    try {
      await whenIdle();
      adopt(await generateSlides(id, { mode: sermon.slideMode === "VERSES" ? "VERSES" : "VERSES_AND_POINTS" }), true);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const situation = sermon.delivery && sermon.status !== "DRAFT" ? formatSituation(sermon) : null;
  const preached = sermon.status === "PREACHED";
  const hasSlides = items.length > 0;

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button asChild variant="outline" size="icon" className="h-11 w-11 flex-none">
              <Link to={`${LIST_PATH}/${id}`} aria-label="Voltar para o esboço">
                <ArrowLeft aria-hidden="true" />
              </Link>
            </Button>
            <h1 className="min-w-0 truncate text-[22px] font-bold">{sermon.title.trim() || "Sem título"}</h1>
          </div>
          {preached && situation ? (
            <span className="flex h-11 items-center rounded-lg border px-4 text-sm font-medium text-muted-foreground">{situation}</span>
          ) : canEdit ? (
            situation ? (
              <Button type="button" variant="outline" className="h-11" onClick={() => setSendOpen(true)}>
                {situation}
              </Button>
            ) : (
              <Button type="button" className="h-11 gap-2" onClick={() => setSendOpen(true)}>
                Enviar para um culto
                <ArrowRight aria-hidden="true" />
              </Button>
            )
          ) : (
            situation && <span className="text-sm text-muted-foreground">{situation}</span>
          )}
        </div>

        {sermon.slidesStale && hasSlides && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 flex-none text-amber-600" aria-hidden="true" />
              O esboço mudou depois destes slides.
            </span>
            {canEdit && (
              <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={busy} onClick={refresh}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Atualizar
              </Button>
            )}
          </div>
        )}

        {!hasSlides ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-12 text-center">
            <p className="text-base font-semibold">Esta palavra ainda não tem slides.</p>
            {canEdit && (
              <Button type="button" className="gap-1.5" onClick={() => setGenerateOpen(true)}>
                <Sparkles aria-hidden="true" />
                Gerar slides
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-start gap-6">
            <section aria-label="Tirado do esboço" className="min-w-0 flex-[1.2_1_420px] overflow-hidden rounded-xl border bg-card">
              <div className="flex items-center gap-3 border-b px-5 py-3.5">
                <Sparkles className="h-4 w-4 flex-none text-primary" aria-hidden="true" />
                <span className="flex-1">
                  <b>Tirado do esboço</b> <span className="text-muted-foreground">· {plural(shown.length)}</span>
                </span>
                {canEdit && (
                  <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setGenerateOpen(true)}>
                    Gerar de novo
                  </Button>
                )}
              </div>
              <SlideList
                items={items}
                readOnly={readOnly}
                onToggle={(slideId, included) => change({ items: toggleSlide(items, slideId, included), style })}
                onMove={(from, to) => {
                  const next = moveSlide(items, from, to);
                  if (next !== items) change({ items: next, style });
                }}
                onEdit={(slideId, text) => {
                  const next = editSlide(items, slideId, text);
                  if (next !== items) change({ items: next, style });
                }}
              />
            </section>

            <section aria-label="No telão" className="flex min-w-0 flex-[1_1_380px] flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">No telão</h2>
                {canEdit ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => change({ items, style: style === "MINIMAL" ? "BACKGROUND" : "MINIMAL" })}
                    className="text-[13px] font-semibold text-primary hover:underline disabled:opacity-60"
                  >
                    {STYLE_NAME[style]} · trocar
                  </button>
                ) : (
                  <span className="text-[13px] text-muted-foreground">{STYLE_NAME[style]}</span>
                )}
              </div>
              {shown.length === 0 ? (
                <p className="rounded-xl border px-4 py-8 text-center text-sm text-muted-foreground">Nenhum slide marcado.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  {shown.map((slide, i) => (
                    <SlidePreview key={i} slide={slide} style={style} size="sm" />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {canEdit && !preached && (
        <SendToServiceDialog
          open={sendOpen}
          onOpenChange={setSendOpen}
          sermonId={id}
          sermonTitle={sermon.title}
          subtitle={`${sermon.title.trim() || "Sem título"} · ${plural(shown.length)}`}
          delivery={sermon.delivery}
          ensureSaved={whenIdle}
          onChanged={(saved) => adopt(saved, !running.current)}
        />
      )}
      {canEdit && (
        <GenerateSlidesDialog
          open={generateOpen}
          onOpenChange={setGenerateOpen}
          sermonId={id}
          title={sermon.title}
          document={sermon.document}
          initialStyle={style}
          initialMode={sermon.slideMode === "VERSES" ? "VERSES" : "VERSES_AND_POINTS"}
          notice={hasSlides ? REGENERATE_NOTICE : undefined}
          ensureSaved={whenIdle}
          onGenerated={(saved) => adopt(saved, true)}
        />
      )}
    </DashboardLayout>
  );
}

export default function SermonSlidesPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { can } = usePermissions();
  const query = useQuery({
    queryKey: detailKey(id),
    queryFn: () => getSermon(id),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  if (query.isError) {
    const notFound = (query.error as { response?: { status?: number } } | null)?.response?.status === 404;
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-lg font-semibold">{notFound ? "Palavra não encontrada." : getApiErrorMessage(query.error)}</p>
          <Link to={LIST_PATH} className="text-sm font-medium text-primary underline">
            Voltar para Palavras
          </Link>
        </div>
      </DashboardLayout>
    );
  }
  // Abre com a cópia buscada agora (o cache do esboço pode estar antigo); depois a tela é dona da lista.
  if (!query.data || !query.isFetchedAfterMount) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-16" role="status" aria-label="Carregando">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      </DashboardLayout>
    );
  }
  return <SlidesView key={id} initial={query.data} canEdit={can("SERMONS", "EDIT")} />;
}
