import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Music, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getApiErrorMessage } from "@/lib/api";
import { createSong, fetchSongs, uploadSongAudio } from "../../api/worship-api";
import { createOrganizedSong, organizeSteps } from "../../lib/create-song";
import { plain, readAudioDuration, songFicha } from "../../lib/format";
import { NewSongForm, type NewSongDraft } from "../NewSongForm";
import { OrganizingScreen } from "../OrganizingScreen";
import { SituationBadge } from "../SituationBadge";

interface AddSongDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Põe a música no fim do roteiro. */
  onAdd: (songId: string) => Promise<unknown>;
  /** Depois de "Organizar": a música foi criada e adicionada; abrir o editor dela. */
  onOpenEditor: (songId: string) => void;
}

/** Adicionar música ao roteiro: procura no repertório ou cria ali mesmo. */
export function AddSongDialog({ open, onOpenChange, onAdd, onOpenEditor }: AddSongDialogProps) {
  const queryClient = useQueryClient();
  const songsQuery = useQuery({ queryKey: ["worship", "songs"], queryFn: fetchSongs, enabled: open });
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<NewSongDraft | null>(null);
  const [step, setStep] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setDraft(null);
    setStep(null);
    setBusy(false);
  }, [open]);

  const typed = search.trim();
  const q = plain(typed);
  const found = q ? (songsQuery.data?.items ?? []).filter((s) => plain(s.title).includes(q)) : [];

  async function add(songId: string) {
    setBusy(true);
    try {
      await onAdd(songId);
      onOpenChange(false);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  /** "Só adicionar ao roteiro": cria como rascunho (com o que já foi preenchido) e adiciona. */
  async function addAsDraft(current: NewSongDraft) {
    setBusy(true);
    try {
      const song = await createSong({ title: current.title.trim(), rawLyrics: current.rawLyrics });
      if (current.file) {
        await uploadSongAudio(song.id, current.file, await readAudioDuration(current.file)).catch((err) =>
          toast.error(`A música foi criada, mas o áudio não foi enviado. ${getApiErrorMessage(err)}`),
        );
      }
      await onAdd(song.id);
      void queryClient.invalidateQueries({ queryKey: ["worship", "songs"] });
      toast.success("Adicionada ao roteiro como rascunho.");
      onOpenChange(false);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function organize(current: NewSongDraft) {
    setStep(0);
    try {
      const { song, audioError } = await createOrganizedSong(
        { title: current.title.trim(), rawLyrics: current.rawLyrics, file: current.file },
        setStep,
      );
      if (audioError) {
        toast.error(`A música foi criada, mas o áudio não foi enviado. ${getApiErrorMessage(audioError)}`);
      }
      await onAdd(song.id);
      void queryClient.invalidateQueries({ queryKey: ["worship", "songs"] });
      onOpenChange(false);
      onOpenEditor(song.id);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
      setStep(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (step === null ? onOpenChange(next) : undefined)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        {step !== null && draft ? (
          <>
            <DialogHeader className="sr-only">
              <DialogTitle>Organizando a música</DialogTitle>
              <DialogDescription>Aguarde.</DialogDescription>
            </DialogHeader>
            <OrganizingScreen steps={organizeSteps(!!draft.file)} current={step} />
          </>
        ) : draft ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Button variant="ghost" size="icon" aria-label="Voltar para a busca" onClick={() => setDraft(null)}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                Nova música
              </DialogTitle>
              <DialogDescription>
                Organizar já separa as partes e abre o editor. Só adicionar guarda como rascunho para montar depois.
              </DialogDescription>
            </DialogHeader>
            <NewSongForm
              idPrefix="roteiro"
              draft={draft}
              onChange={setDraft}
              busy={busy}
              onOrganize={() => void organize(draft)}
              secondary={
                <Button
                  type="button"
                  variant="outline"
                  disabled={!draft.title.trim() || busy}
                  onClick={() => void addAsDraft(draft)}
                >
                  Só adicionar ao roteiro
                </Button>
              }
            />
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Adicionar música</DialogTitle>
              <DialogDescription>Procure no repertório. Se não existir, dá para criar com o nome digitado.</DialogDescription>
            </DialogHeader>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-3.5 h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <Input
                aria-label="Nome da música"
                placeholder="Nome da música"
                value={search}
                autoFocus
                onChange={(e) => setSearch(e.target.value)}
                className="h-12 pl-11 text-base"
              />
            </div>

            {songsQuery.error && (
              <p className="text-sm text-destructive">{getApiErrorMessage(songsQuery.error)}</p>
            )}

            {typed && found.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">No repertório</span>
                <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                  {found.map((song) => (
                    <li key={song.id}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void add(song.id)}
                        className="flex w-full items-center gap-3.5 rounded-lg px-3 py-2.5 text-left hover:bg-primary/10"
                      >
                        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Music className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-[15px] font-semibold">{song.title}</span>
                          <span className="text-[13px] text-muted-foreground">{songFicha(song)}</span>
                        </span>
                        <SituationBadge status={song.status} pending={song.pending} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {typed && found.length === 0 && !songsQuery.isLoading && !songsQuery.error && (
              <p className="text-sm text-muted-foreground">Ainda não está no repertório.</p>
            )}

            {typed && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setDraft({ title: typed, rawLyrics: "", file: null })}
                className="flex w-full items-center gap-3.5 rounded-lg border border-dashed px-3 py-3 text-left font-semibold text-primary hover:bg-primary/5"
              >
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-primary/10">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </span>
                {found.length > 0 ? `Criar “${typed}” como música nova` : `Criar “${typed}”`}
              </button>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
