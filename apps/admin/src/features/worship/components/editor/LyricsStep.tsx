import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListPlus, RotateCcw, Settings2, Sparkles } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/api";
import { fetchLyricsSettings, saveLyricsSettings, type Song } from "../../api/worship-api";
import { PART_KIND_LABEL, deriveSong, type PartKind, type WorshipRow } from "../../lib/document";
import {
  insertCue,
  insertEmptyPart,
  moveCue,
  partAt,
  removeRow,
  renamePart,
  repeatRange,
  setPartKind,
  splitPartAt,
  splitSlideAt,
  mergePart,
  movePart,
  reflowSlide,
  updateCue,
} from "../../lib/row-ops";
import { AudioCard } from "./AudioCard";
import { CueDialog, type CueDraft } from "./CueDialog";
import { LyricsDocument, type DocSelection } from "./LyricsDocument";
import { SelectionToolbar } from "./SelectionToolbar";
import { SlidesPreview } from "./SlidesPreview";

interface LyricsStepProps {
  song: Song;
  rows: WorshipRow[];
  /** A música ainda não foi organizada: mostra a letra colada, não o editor. */
  draft: boolean;
  version: number;
  canEdit: boolean;
  canManageSettings: boolean;
  onChange: (rows: WorshipRow[], external?: boolean) => void;
  /** Refaz a organização no servidor (apaga ajustes e tempos). */
  onOrganize: (rawLyrics?: string) => void;
  organizing: boolean;
  onAudioUploaded: (song: Song) => void;
}

const EMPTY_PARTS: PartKind[] = ["INTRO", "INSTRUMENTAL", "ENDING"];

export function LyricsStep({ song, rows, draft, version, canEdit, canManageSettings, onChange, onOrganize, organizing, onAudioUploaded }: LyricsStepProps) {
  const queryClient = useQueryClient();
  const [selection, setSelection] = useState<DocSelection | null>(null);
  const [cursorRow, setCursorRow] = useState(-1);
  const [cue, setCue] = useState<{ mode: "insert"; before: number } | { mode: "edit"; id: string } | null>(null);
  const [confirmOrganize, setConfirmOrganize] = useState(false);
  const [rawDraft, setRawDraft] = useState(song.rawLyrics);

  const lyricsSettings = useQuery({ queryKey: ["worship", "lyrics-settings"], queryFn: fetchLyricsSettings });
  const saveSettings = useMutation({
    mutationFn: ({ chars, lines }: { chars: number; lines: number }) => saveLyricsSettings(chars, lines),
    onSuccess: (saved) => {
      queryClient.setQueryData(["worship", "lyrics-settings"], saved);
      toast.success("Padrão de slides salvo para toda a igreja.");
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const maxChars = lyricsSettings.data?.lyricMaxChars ?? 28;
  const maxLines = lyricsSettings.data?.lyricMaxLines ?? 3;

  const derived = useMemo(() => deriveSong(rows), [rows]);

  const handleSelection = useCallback((next: DocSelection | null) => {
    setSelection(next);
    if (next) setCursorRow(next.from);
  }, []);

  /** O slide onde está o cursor, para destacar na prévia. */
  const selectedSlide = useMemo(() => {
    if (cursorRow < 0) return -1;
    let found = -1;
    const firstRowIndex = new Map(rows.map((r, i) => [r.id, i]));
    for (const s of derived.slides) {
      if ((firstRowIndex.get(s.rowId) ?? Infinity) <= cursorRow) found = s.index;
    }
    return found;
  }, [cursorRow, derived.slides, rows]);

  const editingCue = cue?.mode === "edit" ? rows.find((r) => r.id === cue.id) : undefined;
  const cueInitial: CueDraft | null = editingCue ? { target: editingCue.target ?? "ALL", text: editingCue.text ?? "" } : null;

  // Rascunho: ainda não há documento. Mostra a letra colada e o botão de organizar.
  if (draft) {
    return (
      <div className="flex flex-wrap items-start gap-6">
        <section className="flex min-w-0 flex-[2_1_560px] flex-col gap-4 rounded-xl border bg-card p-6">
          <div>
            <h2 className="text-lg font-bold">Esta música ainda é um rascunho</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Cole a letra do jeito que veio. Linha em branco separa as partes, <code>//</code> é recado para a banda e{" "}
              <code>(2x)</code> repete a linha.
            </p>
          </div>
          <Textarea
            aria-label="Letra"
            value={rawDraft}
            maxLength={20000}
            disabled={!canEdit}
            onChange={(e) => setRawDraft(e.target.value)}
            placeholder="Cole do jeito que veio, com os recados da banda."
            className="min-h-[320px] rounded-xl px-5 py-4 text-base leading-relaxed"
          />
          {canEdit && (
            <div className="flex justify-end">
              <Button className="gap-2" disabled={!rawDraft.trim() || organizing} onClick={() => onOrganize(rawDraft)}>
                <Sparkles className="h-4 w-4" />
                Organizar
              </Button>
            </div>
          )}
          {canManageSettings && <LyricsSettingsControl chars={maxChars} lines={maxLines} saving={saveSettings.isPending} onSave={(chars, lines) => saveSettings.mutateAsync({ chars, lines }).then(() => undefined)} />}
        </section>
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-6">
          <AudioCard song={song} canEdit={canEdit} onUploaded={onAudioUploaded} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-start gap-6">
      <section aria-label="Editor da letra" className="flex min-w-0 flex-[2_1_560px] flex-col rounded-xl border bg-card">
        <div className="flex flex-wrap items-center gap-3 border-b py-2 pl-5 pr-3">
          <Sparkles className="h-[18px] w-[18px] flex-none text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <b>Organizada automaticamente</b>{" "}
            <span className="text-muted-foreground">
              · {derived.parts.length} {derived.parts.length === 1 ? "parte" : "partes"} · {derived.slides.length}{" "}
              {derived.slides.length === 1 ? "slide" : "slides"}
            </span>
          </span>
          {canEdit && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <ListPlus className="h-4 w-4" />
                    Parte sem letra
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {EMPTY_PARTS.map((kind) => (
                    <DropdownMenuItem key={kind} onSelect={() => onChange(insertEmptyPart(rows, cursorRow, kind), true)}>
                      {PART_KIND_LABEL[kind]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Organizar de novo"
                title="Organizar de novo"
                disabled={organizing}
                onClick={() => setConfirmOrganize(true)}
              >
                <RotateCcw className="h-[18px] w-[18px]" />
              </Button>
            </>
          )}
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span>Padrão da igreja: até {maxChars} caracteres · {maxLines} {maxLines === 1 ? "linha" : "linhas"}/slide</span>
            {canManageSettings && <LyricsSettingsControl chars={maxChars} lines={maxLines} saving={saveSettings.isPending} onSave={(chars, lines) => saveSettings.mutateAsync({ chars, lines }).then(() => undefined)} />}
          </div>
        </div>

        <LyricsDocument
          rows={rows}
          version={version}
          readOnly={!canEdit}
          onChange={onChange}
          onSelection={handleSelection}
          onCueClick={(id) => canEdit && setCue({ mode: "edit", id })}
          onMoveCue={(id, beforeIndex, destination) => onChange(moveCue(rows, id, beforeIndex, destination), true)}
          onRenamePart={(rowId, choice) => onChange(renamePart(rows, rowId, choice.kind, choice.name), true)}
          onPartAction={(rowId, action, choice) => {
            const partIndex = derived.parts.findIndex((item) => item.rowId === rowId);
            const part = derived.parts[partIndex];
            if (!part) return;
            const start = rows.findIndex((row) => row.id === rowId);
            const nextPart = derived.parts[partIndex + 1];
            const end = nextPart ? rows.findIndex((row) => row.id === nextPart.rowId) : rows.length;
            if (action === "up") onChange(movePart(rows, rowId, -1), true);
            else if (action === "down") onChange(movePart(rows, rowId, 1), true);
            else if (action === "mergePrevious") onChange(mergePart(rows, rowId, "previous"), true);
            else if (action === "mergeNext") onChange(mergePart(rows, rowId, "next"), true);
            else if (action === "cueStart") setCue({ mode: "insert", before: start });
            else if (action === "cueEnd") {
              let at = end;
              while (at > start && rows[at - 1].type === "break") at -= 1;
              setCue({ mode: "insert", before: at });
            } else if (action === "split" && choice) {
              const selected = selection?.from ?? cursorRow;
              const at = selected >= start && selected < end ? selected : start + 1;
              const next = splitPartAt(rows, at, choice.kind, choice.name);
              if (next !== rows) onChange(next, true);
            }
          }}
          renderToolbar={(sel) => (
            <SelectionToolbar
              activeKind={partAt(rows, sel.from).kind}
              collapsed={sel.collapsed}
              onKind={(kind) => onChange(setPartKind(rows, sel.from, sel.to, kind), true)}
              onCue={() => setCue({ mode: "insert", before: sel.from })}
              onRepeat={() => onChange(repeatRange(rows, sel.from, sel.to), true)}
              onSplit={() => onChange(splitSlideAt(rows, sel.from), true)}
            />
          )}
        />
        {canEdit && (
          <p className="border-t px-5 py-3 text-[13px] text-muted-foreground">
            Selecione um trecho para dizer o que ele é. Linha em branco separa um slide do outro. Clique no nome da
            parte para renomear e arraste as instruções para mudá-las de lugar (pelo teclado: Tab até a instrução e
            Alt+↑ ou Alt+↓).
          </p>
        )}
      </section>

      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-6">
        <AudioCard song={song} canEdit={canEdit} onUploaded={onAudioUploaded} />
        <SlidesPreview
          slides={derived.slides}
          selected={selectedSlide}
          maxChars={maxChars}
          maxLines={maxLines}
          canEdit={canEdit}
          onReflow={(rowId) => onChange(reflowSlide(rows, rowId, maxChars, maxLines), true)}
        />
      </div>

      <CueDialog
        open={cue !== null}
        initial={cueInitial}
        onOpenChange={(open) => !open && setCue(null)}
        onConfirm={(draft) => {
          if (cue?.mode === "insert") onChange(insertCue(rows, cue.before, draft.target, draft.text), true);
          else if (cue?.mode === "edit") onChange(updateCue(rows, cue.id, draft.target, draft.text), true);
          setCue(null);
        }}
        onRemove={
          cue?.mode === "edit"
            ? () => {
                onChange(removeRow(rows, cue.id), true);
                setCue(null);
              }
            : undefined
        }
      />

      <AlertDialog open={confirmOrganize} onOpenChange={setConfirmOrganize}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Organizar de novo?</AlertDialogTitle>
            <AlertDialogDescription>
              A letra volta a ser separada a partir do texto colado no começo. Os ajustes feitos aqui, as instruções
              inseridas à mão e os tempos já marcados são apagados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => onOrganize()}>Organizar de novo</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LyricsSettingsControl({
  chars,
  lines,
  saving,
  onSave,
}: {
  chars: number;
  lines: number;
  saving: boolean;
  onSave: (chars: number, lines: number) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [nextChars, setNextChars] = useState(String(chars));
  const [nextLines, setNextLines] = useState(String(lines));
  const parsedChars = Number(nextChars);
  const parsedLines = Number(nextLines);
  const valid = nextChars !== "" && nextLines !== "" && Number.isInteger(parsedChars) && Number.isInteger(parsedLines) && parsedChars >= 10 && parsedChars <= 60 && parsedLines >= 1 && parsedLines <= 5;
  const save = async () => {
    if (!valid) return;
    try {
      await onSave(parsedChars, parsedLines);
      setOpen(false);
    } catch {
      // O erro já é informado pela mutação; manter o diálogo aberto permite corrigir ou tentar novamente.
    }
  };
  return (
    <Dialog open={open} onOpenChange={(value) => {
      setOpen(value);
      if (value) {
        setNextChars(String(chars));
        setNextLines(String(lines));
      }
    }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2"><Settings2 className="h-4 w-4" />Configurar</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Padrão dos slides</DialogTitle>
          <DialogDescription>Este padrão vale para todas as pessoas da igreja. Letras já editadas só mudam quando você ajustar cada slide.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <label className="space-y-1.5 text-sm font-medium">Caracteres por linha
            <Input type="number" min={10} max={60} step={1} value={nextChars} aria-invalid={nextChars !== "" && (parsedChars < 10 || parsedChars > 60 || !Number.isInteger(parsedChars))} onChange={(event) => setNextChars(event.target.value)} />
          </label>
          <label className="space-y-1.5 text-sm font-medium">Linhas por slide
            <Input type="number" min={1} max={5} step={1} value={nextLines} aria-invalid={nextLines !== "" && (parsedLines < 1 || parsedLines > 5 || !Number.isInteger(parsedLines))} onChange={(event) => setNextLines(event.target.value)} />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">De 10 a 60 caracteres e de 1 a 5 linhas. O padrão inicial é 28 caracteres e 3 linhas.</p>
        <DialogFooter><Button onClick={() => void save()} disabled={saving || !valid}>Salvar padrão da igreja</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
