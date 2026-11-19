import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Loader2, Pencil } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/features/access/hooks/use-permissions";
import { getApiErrorMessage } from "@/lib/api";
import {
  fetchSong,
  markSongReady,
  organizeSong,
  saveSongRows,
  unmarkSongReady,
  updateSongInfo,
  type Song,
  type SongInfoBody,
} from "../api/worship-api";
import { LyricsStep } from "../components/editor/LyricsStep";
import { MoodsStep } from "../components/editor/MoodsStep";
import { PreviewStep } from "../components/editor/PreviewStep";
import { SongInfoDialog } from "../components/editor/SongInfoDialog";
import { StepTrail } from "../components/editor/StepTrail";
import { TimingStep } from "../components/editor/TimingStep";
import { SituationBadge } from "../components/SituationBadge";
import { songStatus, type WorshipRow } from "../lib/document";
import { PENDING_LABEL } from "../lib/labels";

type SaveState = "idle" | "saving" | "saved" | "error";
const SAVE_DELAY_MS = 800;

export default function SongEditorPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { can } = usePermissions();
  const canEdit = can("WORSHIP", "EDIT");
  const step = Math.min(4, Math.max(1, Number(params.get("passo")) || 1));

  // A cópia do servidor só serve para abrir o editor: depois disso quem manda é o estado local.
  const songQuery = useQuery({
    queryKey: ["worship", "song", id],
    queryFn: () => fetchSong(id),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const [song, setSong] = useState<Song | null>(null);
  const [rows, setRows] = useState<WorshipRow[]>([]);
  const [version, setVersion] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [infoOpen, setInfoOpen] = useState(false);

  const rowsRef = useRef<WorshipRow[]>([]);
  const dirty = useRef(false);
  const saving = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!songQuery.data || song) return;
    setSong(songQuery.data);
    setRows(songQuery.data.rows);
    rowsRef.current = songQuery.data.rows;
    setVersion((v) => v + 1);
  }, [songQuery.data, song]);

  const refreshList = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["worship", "songs"] });
    void queryClient.invalidateQueries({ queryKey: ["worship", "service"] });
  }, [queryClient]);

  /** Salva o documento se houver mudança pendente; devolve quando o servidor confirmou. */
  const flush = useCallback(async (): Promise<void> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (saving.current) await saving.current;
    if (!dirty.current) return;
    dirty.current = false;
    setSaveState("saving");
    const run = (async () => {
      try {
        const saved = await saveSongRows(id, rowsRef.current);
        // Do servidor vem a situação e o áudio; o documento local pode já estar adiante.
        setSong((current) => (current ? { ...saved, rows: current.rows } : saved));
        setSaveState(dirty.current ? "saving" : "saved");
        refreshList();
      } catch (err) {
        dirty.current = true;
        setSaveState("error");
        toast.error(`Não foi possível salvar. ${getApiErrorMessage(err)}`);
      }
    })();
    saving.current = run;
    await run;
    saving.current = null;
  }, [id, refreshList]);

  const flushRef = useRef(flush);
  flushRef.current = flush;

  const change = useCallback(
    (next: WorshipRow[], external = false) => {
      if (!canEdit) return;
      rowsRef.current = next;
      setRows(next);
      if (external) setVersion((v) => v + 1);
      dirty.current = true;
      setSaveState("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flushRef.current(), SAVE_DELAY_MS);
    },
    [canEdit],
  );

  // Ao sair do editor, salva o que estiver pendente; ao fechar a aba, avisa.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      void flushRef.current();
    };
  }, []);

  /** Resposta do servidor que troca o documento inteiro (organizar) ou só os dados (áudio, ficha). */
  const adopt = useCallback(
    (saved: Song, replaceRows: boolean) => {
      setSong(saved);
      if (replaceRows) {
        rowsRef.current = saved.rows;
        setRows(saved.rows);
        setVersion((v) => v + 1);
        dirty.current = false;
      }
      refreshList();
    },
    [refreshList],
  );

  const organize = useMutation({
    mutationFn: async (rawLyrics?: string) => {
      if (timer.current) clearTimeout(timer.current);
      dirty.current = false;
      return organizeSong(id, rawLyrics);
    },
    onSuccess: (saved) => {
      adopt(saved, true);
      toast.success("Letra organizada.");
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const info = useMutation({
    mutationFn: (body: SongInfoBody) => updateSongInfo(id, body),
    onSuccess: (saved) => {
      adopt(saved, false);
      setInfoOpen(false);
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const ready = useMutation({
    mutationFn: async (value: boolean) => {
      await flushRef.current();
      return value ? markSongReady(id) : unmarkSongReady(id);
    },
    onSuccess: (saved, value) => {
      adopt(saved, false);
      if (value) {
        toast.success("Pronta para o culto.");
        navigate("/cultos/musicas");
      }
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const live = useMemo(
    () =>
      songStatus(
        rows,
        { url: song?.audio?.url ?? null, durationSeconds: song?.audio?.durationSeconds ?? null },
        song?.readyAt ?? null,
      ),
    [rows, song],
  );

  if (songQuery.error) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col items-start justify-center gap-4 p-8">
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {getApiErrorMessage(songQuery.error)}
        </p>
        <Button asChild variant="outline">
          <Link to="/cultos/musicas">Voltar para Músicas</Link>
        </Button>
      </div>
    );
  }
  if (!song) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" aria-label="Carregando" />
      </div>
    );
  }

  const liveSong: Song = { ...song, rows };
  const hasSlides = live.slideCount > 0;
  const done = [
    hasSlides ? 1 : 0,
    hasSlides && !live.pending.includes("AUDIO") && !live.pending.includes("TIMES") ? 2 : 0,
    hasSlides && !live.pending.includes("MOODS") ? 3 : 0,
    live.status === "READY" ? 4 : 0,
  ].filter(Boolean);
  const missing = live.pending.filter((p) => p !== "CONFIRM");
  const goTo = (next: number) => setParams(next === 1 ? {} : { passo: String(next) }, { replace: false });

  return (
    <div className="min-h-screen bg-background px-4 pb-12 pt-6 sm:px-8 lg:px-10">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 flex-none"
              aria-label={step === 1 ? "Voltar para Músicas" : "Voltar ao passo anterior"}
              onClick={() => (step === 1 ? navigate("/cultos/musicas") : goTo(step - 1))}
            >
              <ArrowLeft className="h-[18px] w-[18px]" />
            </Button>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => setInfoOpen(true)}
              title={canEdit ? "Abrir a ficha da música" : undefined}
              className="group flex min-w-0 items-center gap-2 text-left"
            >
              <h1 className="truncate text-[22px] font-bold">{song.title}</h1>
              {canEdit && <Pencil className="h-4 w-4 flex-none text-muted-foreground opacity-60 group-hover:opacity-100" aria-hidden="true" />}
            </button>
            <SituationBadge status={live.status} pending={live.pending} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {canEdit && (
              <span role="status" className="text-[13px] text-muted-foreground">
                {saveState === "saving" && "Salvando…"}
                {saveState === "saved" && "Salvo"}
                {saveState === "error" && (
                  <button type="button" className="font-semibold text-destructive underline" onClick={() => void flush()}>
                    Não salvou. Tentar de novo
                  </button>
                )}
              </span>
            )}
            {step < 4 ? (
              <Button className="h-11 gap-2" onClick={() => goTo(step + 1)}>
                Continuar
                <ArrowRight className="h-[18px] w-[18px]" />
              </Button>
            ) : live.status === "READY" ? (
              <span className="flex items-center gap-3">
                {canEdit && (
                  <Button variant="ghost" disabled={ready.isPending} onClick={() => ready.mutate(false)}>
                    Desmarcar
                  </Button>
                )}
                <span className="inline-flex h-11 items-center gap-2 rounded-md bg-green-800 px-4 font-semibold text-white">
                  <Check className="h-[18px] w-[18px]" />
                  Pronta para o culto
                </span>
              </span>
            ) : (
              canEdit && (
                <Button
                  className="h-11 gap-2"
                  disabled={!hasSlides || missing.length > 0 || ready.isPending}
                  title={missing.length ? `Ainda falta: ${missing.map((p) => PENDING_LABEL[p]).join("; ")}.` : undefined}
                  onClick={() => ready.mutate(true)}
                >
                  <Check className="h-[18px] w-[18px]" />
                  Pronta para o culto
                </Button>
              )
            )}
          </div>
        </div>

        <StepTrail current={step} done={done} onGo={goTo} />

        {step === 4 && live.status !== "READY" && (missing.length > 0 || !hasSlides) && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {hasSlides
              ? `Para marcar como pronta ainda falta: ${missing.map((p) => PENDING_LABEL[p]).join("; ")}.`
              : "Para marcar como pronta, organize a letra no passo 1."}
          </p>
        )}

        {step === 1 && (
          <LyricsStep
            song={liveSong}
            rows={rows}
            version={version}
            canEdit={canEdit}
            onChange={change}
            onOrganize={(rawLyrics) => organize.mutate(rawLyrics)}
            organizing={organize.isPending}
            onAudioUploaded={(saved) => adopt(saved, false)}
          />
        )}
        {step === 2 && (
          <TimingStep
            song={liveSong}
            rows={rows}
            canEdit={canEdit}
            onChange={(next) => change(next)}
            onAudioUploaded={(saved) => adopt(saved, false)}
          />
        )}
        {step === 3 && (
          <MoodsStep
            rows={rows}
            duration={song.audio?.durationSeconds ?? null}
            canEdit={canEdit}
            onChange={(next) => change(next)}
          />
        )}
        {step === 4 && <PreviewStep song={liveSong} rows={rows} />}
      </div>

      <SongInfoDialog
        song={song}
        open={infoOpen}
        onOpenChange={setInfoOpen}
        onSave={(body) => info.mutate(body)}
        saving={info.isPending}
      />
    </div>
  );
}
