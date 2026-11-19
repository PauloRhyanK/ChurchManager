import { ListPlus, RotateCcw, Sparkles } from "lucide-react";
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
import type { Song } from "../../api/worship-api";
import { PART_KIND_LABEL, deriveSong, type PartKind, type WorshipRow } from "../../lib/document";
import {
  insertCue,
  insertEmptyPart,
  partAt,
  removeRow,
  repeatRange,
  setPartKind,
  splitSlideAt,
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
  version: number;
  canEdit: boolean;
  onChange: (rows: WorshipRow[], external?: boolean) => void;
  /** Refaz a organização no servidor (apaga ajustes e tempos). */
  onOrganize: (rawLyrics?: string) => void;
  organizing: boolean;
  onAudioUploaded: (song: Song) => void;
}

const EMPTY_PARTS: PartKind[] = ["INTRO", "INSTRUMENTAL", "ENDING"];

export function LyricsStep({ song, rows, version, canEdit, onChange, onOrganize, organizing, onAudioUploaded }: LyricsStepProps) {
  const [selection, setSelection] = useState<DocSelection | null>(null);
  const [cursorRow, setCursorRow] = useState(-1);
  const [cue, setCue] = useState<{ mode: "insert"; before: number } | { mode: "edit"; id: string } | null>(null);
  const [confirmOrganize, setConfirmOrganize] = useState(false);
  const [rawDraft, setRawDraft] = useState(song.rawLyrics);

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
  if (rows.length === 0) {
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
        </div>

        <LyricsDocument
          rows={rows}
          version={version}
          readOnly={!canEdit}
          onChange={onChange}
          onSelection={handleSelection}
          onCueClick={(id) => canEdit && setCue({ mode: "edit", id })}
          renderToolbar={(sel) => (
            <SelectionToolbar
              activeKind={partAt(rows, sel.from).kind}
              onKind={(kind) => onChange(setPartKind(rows, sel.from, sel.to, kind), true)}
              onCue={() => setCue({ mode: "insert", before: sel.from })}
              onRepeat={() => onChange(repeatRange(rows, sel.from, sel.to), true)}
              onSplit={() => onChange(splitSlideAt(rows, sel.from), true)}
            />
          )}
        />
        {canEdit && (
          <p className="border-t px-5 py-3 text-[13px] text-muted-foreground">
            Selecione um trecho para dizer o que ele é. Linha em branco separa um slide do outro.
          </p>
        )}
      </section>

      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-6">
        <AudioCard song={song} canEdit={canEdit} onUploaded={onAudioUploaded} />
        <SlidesPreview slides={derived.slides} selected={selectedSlide} />
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
