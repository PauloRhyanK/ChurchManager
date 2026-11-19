import { useQuery } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { listBibleTranslations, searchBible, type BibleHit } from "../api/sermons-api";
import type { VerseAttrs } from "../lib/document";
import { BLOCK_COLORS } from "./block-colors";

export type ManualVerse = { reference: string; text: string };
type VerseBlock = Omit<VerseAttrs, "id">;

/** Atributos de um Versículo digitado à mão: só referência e texto, o resto nulo. */
// eslint-disable-next-line react-refresh/only-export-components
export function manualVerseAttrs({ reference, text }: ManualVerse): VerseBlock {
  return { reference, book: null, chapter: null, verseStart: null, verseEnd: null, translation: null, verses: [{ number: null, text }] };
}

/** O bloco que um resultado da busca vira: os campos do hit, sem a dica e sem mudar nada. */
function hitAttrs(hit: BibleHit): VerseBlock {
  return {
    reference: hit.reference,
    book: hit.book,
    chapter: hit.chapter,
    verseStart: hit.verseStart,
    verseEnd: hit.verseEnd,
    translation: hit.translation,
    verses: hit.verses,
  };
}

interface VerseDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Com valores: alterar um Versículo já inserido. Sem: inserir um novo. */
  initial?: VerseBlock;
  /** Recebe o bloco pronto (da Bíblia ou digitado à mão). */
  onSubmit(attrs: VerseBlock): void;
  /** Só no modo de alteração. */
  onRemove?(): void;
  /** Para onde o foco volta quando o diálogo fecha (o editor). */
  restoreFocus?(): void;
}

const REFERENCE_MAX = 120;
const SEARCH_DELAY_MS = 250;
const SEARCH_MIN = 3;
const HOUR_MS = 60 * 60 * 1000;

const joinedText = (block?: VerseBlock) => (block ? block.verses.map((v) => v.text).join(" ") : "");
const fromBible = (block?: VerseBlock) => Boolean(block && block.translation !== null);

/** Versículo: busca na Bíblia (referência ou trecho) e, como alternativa, digitado à mão. */
export function VerseDialog({ open, onOpenChange, initial, onSubmit, onRemove, restoreFocus }: VerseDialogProps) {
  const editing = initial !== undefined;
  const listId = useId();
  const [manualChosen, setManualChosen] = useState(editing && !fromBible(initial));
  const [query, setQuery] = useState(fromBible(initial) ? initial!.reference : "");
  const [debounced, setDebounced] = useState(query);
  const [chosenCode, setChosenCode] = useState<string | null>(initial?.translation ?? null);
  const [highlight, setHighlight] = useState({ key: "", index: 0 });
  const [reference, setReference] = useState(initial?.reference ?? "");
  const [text, setText] = useState(joinedText(initial));
  const activeRef = useRef<HTMLLIElement>(null);

  // Reinicia só quando o conteúdo de `initial` muda, não quando o objeto é outro com o mesmo conteúdo.
  const initialReference = initial?.reference ?? "";
  const initialTranslation = initial?.translation ?? null;
  const initialText = joinedText(initial);
  useEffect(() => {
    if (!open) return;
    const bible = editing && initialTranslation !== null;
    setManualChosen(editing && !bible);
    setQuery(bible ? initialReference : "");
    setDebounced(bible ? initialReference : "");
    setChosenCode(initialTranslation);
    setReference(initialReference);
    setText(initialText);
  }, [open, editing, initialReference, initialTranslation, initialText]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const translations = useQuery({
    queryKey: ["sermons", "bible", "translations"],
    queryFn: listBibleTranslations,
    staleTime: HOUR_MS,
    enabled: open,
  });
  const list = translations.data ?? [];
  const bibleUnavailable = translations.isError || (translations.isSuccess && list.length === 0);
  const translation = list.find((t) => t.code === chosenCode) ?? list.find((t) => t.isDefault) ?? list[0];
  const manual = manualChosen || bibleUnavailable;

  // A chave é o texto já com a espera aplicada; o resultado só aparece quando ele é igual ao campo.
  const term = query.trim();
  const settled = debounced === term && term.length >= SEARCH_MIN && translation !== undefined;
  const results = useQuery({
    queryKey: ["sermons", "bible", "search", debounced, translation?.code],
    queryFn: () => searchBible(debounced, translation!.code),
    enabled: open && !manual && settled,
  });
  const hits = settled ? (results.data?.hits ?? []) : [];
  const resultKey = `${debounced}\u0000${translation?.code ?? ""}`;
  const active = highlight.key === resultKey ? Math.min(highlight.index, Math.max(hits.length - 1, 0)) : 0;

  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [active, hits.length]);

  function insertHit(hit: BibleHit) {
    onSubmit(hitAttrs(hit));
    onOpenChange(false);
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!hits.length) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlight({ key: resultKey, index: Math.min(Math.max(active + step, 0), hits.length - 1) });
    } else if (event.key === "Enter") {
      event.preventDefault();
      const hit = hits[active];
      if (hit) insertHit(hit);
    }
  }

  const verse = { reference: reference.trim(), text: text.trim() };
  const ready = verse.reference !== "" && verse.text !== "";

  function submitManual(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    onSubmit(manualVerseAttrs(verse));
    onOpenChange(false);
  }

  const removeButton =
    editing && onRemove ? (
      <Button
        type="button"
        variant="outline"
        className="text-destructive"
        onClick={() => {
          onRemove();
          onOpenChange(false);
        }}
      >
        Remover
      </Button>
    ) : null;

  let status: string | null = null;
  if (term.length >= SEARCH_MIN) {
    if (!settled || results.isPending) status = "Procurando…";
    else if (results.isError) status = "Não foi possível procurar agora.";
    else if (!hits.length) status = "Nada encontrado. Confira a referência ou digite à mão.";
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        onCloseAutoFocus={(event) => {
          if (!restoreFocus) return;
          event.preventDefault();
          restoreFocus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{editing ? "Alterar versículo" : "Inserir versículo"}</DialogTitle>
          <DialogDescription>
            {manual ? "Digite a referência e o texto do versículo." : "Procure pela referência (mt 5 14) ou por um trecho do versículo."}
          </DialogDescription>
        </DialogHeader>
        {manual ? (
          <form onSubmit={submitManual} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="verse-reference">Referência</Label>
              <Input
                id="verse-reference"
                value={reference}
                maxLength={REFERENCE_MAX}
                placeholder="João 3:16"
                required
                autoComplete="off"
                autoFocus
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="verse-text">Texto</Label>
              <Textarea id="verse-text" value={text} rows={5} required onChange={(e) => setText(e.target.value)} />
            </div>
            <DialogFooter className="gap-2 sm:items-center sm:justify-between">
              {removeButton ?? <span />}
              <div className="flex items-center gap-3">
                {!bibleUnavailable && (
                  <Button type="button" variant="link" className="h-auto px-0" onClick={() => setManualChosen(false)}>
                    Voltar para a busca
                  </Button>
                )}
                <Button type="submit" disabled={!ready}>
                  {editing ? "Salvar" : "Inserir"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        ) : (
          <div className="grid gap-3">
            <div className="relative">
              <BookOpen aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: BLOCK_COLORS.verse.dot }} />
              <Input
                role="combobox"
                aria-expanded={hits.length > 0}
                aria-autocomplete="list"
                aria-label="Referência ou palavras do versículo"
                aria-controls={hits.length ? listId : undefined}
                aria-activedescendant={hits.length ? `${listId}-${active}` : undefined}
                value={query}
                maxLength={REFERENCE_MAX}
                placeholder="João 3:16 ou um trecho"
                autoComplete="off"
                autoFocus
                className="h-11 pl-9 text-base"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onSearchKeyDown}
              />
            </div>
            {hits.length > 0 ? (
              <ul id={listId} role="listbox" aria-label="Versículos encontrados" className="max-h-[min(50vh,360px)] overflow-y-auto">
                {hits.map((hit, i) => (
                  <li
                    key={`${hit.reference}-${hit.verses.length}`}
                    id={`${listId}-${i}`}
                    ref={i === active ? activeRef : undefined}
                    role="option"
                    aria-selected={i === active}
                    className={cn("cursor-pointer rounded-lg px-3 py-2.5", i !== active && "hover:bg-muted")}
                    style={i === active ? { backgroundColor: BLOCK_COLORS.verse.background } : undefined}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseMove={() => i !== active && setHighlight({ key: resultKey, index: i })}
                    onClick={() => insertHit(hit)}
                  >
                    <div className="text-sm font-bold" style={{ color: BLOCK_COLORS.verse.accent }}>
                      {hit.reference}
                    </div>
                    <div className="line-clamp-2 text-sm text-muted-foreground">{hit.hint ?? hit.verses.map((v) => v.text).join(" ")}</div>
                  </li>
                ))}
              </ul>
            ) : (
              status && (
                <p role="status" className="px-1 py-3 text-sm text-muted-foreground">
                  {status}
                </p>
              )
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
              <div className="flex min-w-0 items-center gap-2">
                {list.length > 1 ? (
                  <>
                    <select
                      aria-label="Tradução"
                      value={translation?.code ?? ""}
                      onChange={(e) => setChosenCode(e.target.value)}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {list.map((t) => (
                        <option key={t.code} value={t.code}>
                          {t.shortName}
                        </option>
                      ))}
                    </select>
                    {translation && <span title={translation.attribution}>{translation.license}</span>}
                  </>
                ) : (
                  translation && <span title={translation.attribution}>{`${translation.shortName} · ${translation.license}`}</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Button type="button" variant="link" className="h-auto px-0 text-xs" onClick={() => setManualChosen(true)}>
                  Digitar à mão
                </Button>
                <span>Enter insere</span>
              </div>
            </div>
            {removeButton && <div className="flex">{removeButton}</div>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
