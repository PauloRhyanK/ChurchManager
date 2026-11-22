import { MoreHorizontal, Pencil } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { CUE_TARGET_LABEL, deriveSong, type DerivedPart, type PartKind, type WorshipRow } from "../../lib/document";
import { PART_TONE } from "../../lib/part-colors";
import type { PartChoice } from "../../lib/part-names";
import { pasteLines, rowsFromEditorNodes, type EditorNode } from "../../lib/row-ops";
import { PartNamePicker } from "./PartNamePicker";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export interface DocSelection {
  /** Primeira e última linha tocadas pela seleção (índices no documento). */
  from: number;
  to: number;
  collapsed: boolean;
  /** Posição do trecho selecionado, relativa ao documento. */
  top: number;
  left: number;
}

interface LyricsDocumentProps {
  rows: WorshipRow[];
  /** Muda quando o documento foi alterado por fora (barrinha, organizar): o DOM é refeito. */
  version: number;
  readOnly: boolean;
  /** `external`: a mudança não veio de digitação e o DOM precisa ser refeito. */
  onChange: (rows: WorshipRow[], external?: boolean) => void;
  onSelection: (selection: DocSelection | null) => void;
  onCueClick: (rowId: string) => void;
  /** Leva a instrução para antes da linha `beforeIndex` (arrastando ou com Alt+setas). */
  onMoveCue: (rowId: string, beforeIndex: number, destination?: "part-end") => void;
  /** Renomeia a parte que começa na linha `rowId`. */
  onRenamePart: (rowId: string, choice: PartChoice) => void;
  onPartAction: (rowId: string, action: "up" | "down" | "split" | "mergePrevious" | "mergeNext" | "cueStart" | "cueEnd", choice?: PartChoice) => void;
  /** A barrinha flutuante, desenhada sobre o trecho selecionado. */
  renderToolbar: (selection: DocSelection) => ReactNode;
}

const CHIP_CLASS =
  "inline-flex cursor-grab touch-none select-none items-center gap-1.5 rounded-md bg-amber-100 py-0.5 pl-1.5 pr-2.5 align-middle text-[13px] leading-5 text-amber-900 shadow-sm outline-none hover:bg-amber-200 focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing dark:bg-amber-900/60 dark:text-amber-100 dark:hover:bg-amber-900";
const GRIP_CLASS = "text-[11px] leading-none tracking-[-2px] text-amber-700/70 dark:text-amber-200/70";
const PART_GAP_CLASS = "mt-7";
/** Distância (px) que o ponteiro anda antes de virar arrasto, e não clique. */
const DRAG_THRESHOLD = 5;

interface PartBox {
  part: DerivedPart;
  top: number;
  bottom: number;
  endIndex: number;
  outsideIndex: number;
}
interface SlideBox {
  index: number;
  kind: PartKind;
  top: number;
  bottom: number;
}
interface Layout {
  left: number;
  width: number;
  parts: PartBox[];
  slides: SlideBox[];
  /** Altura (relativa ao documento) de cada vão entre linhas: `gaps[k]` fica antes da linha `k`. */
  gaps: number[];
}
const EMPTY_LAYOUT: Layout = { left: 0, width: 0, parts: [], slides: [], gaps: [] };

const isBlankRow = (row: WorshipRow | undefined) => !row || row.type === "break" || (row.type === "lyric" && !(row.text ?? "").trim());

function buildRow(row: WorshipRow): HTMLElement {
  const el = document.createElement("div");
  el.dataset.rowId = row.id;
  if (row.type === "cue") {
    el.dataset.cue = "1";
    el.contentEditable = "false";
    const chip = document.createElement("span");
    chip.className = CHIP_CLASS;
    chip.tabIndex = 0;
    chip.setAttribute("role", "button");
    chip.dataset.cueChip = "1";
    const who = CUE_TARGET_LABEL[row.target ?? "ALL"];
    chip.setAttribute(
      "aria-label",
      `Instrução para ${who}: ${row.text ?? ""}. Enter edita; Alt com seta para cima ou para baixo muda de lugar.`,
    );
    chip.title = "Arraste para mudar de lugar · clique para editar";
    const grip = document.createElement("span");
    grip.className = GRIP_CLASS;
    grip.setAttribute("aria-hidden", "true");
    grip.textContent = "⋮⋮";
    const label = document.createElement("b");
    label.textContent = who;
    chip.append(grip, label, ` ${row.text ?? ""}`);
    el.append(chip);
  } else if (row.type === "break" || !row.text) {
    el.append(document.createElement("br"));
  } else {
    el.textContent = row.text;
  }
  return el;
}

/** Guarda a seleção, roda `fn` (que mexe no DOM) e devolve a seleção ao lugar. */
function keepingSelection(fn: () => void) {
  const sel = window.getSelection();
  const saved =
    sel && sel.rangeCount
      ? { an: sel.anchorNode, ao: sel.anchorOffset, fn: sel.focusNode, fo: sel.focusOffset }
      : null;
  fn();
  if (sel && saved?.an?.isConnected && saved.fn?.isConnected) {
    try {
      sel.setBaseAndExtent(saved.an, saved.ao, saved.fn, saved.fo);
    } catch {
      // posição que deixou de existir: o navegador decide onde pôr o cursor
    }
  }
}

/**
 * Deixa o DOM no formato "um <div> por linha" (o navegador às vezes deixa
 * texto solto ou aninha blocos) e devolve os elementos, um por linha.
 */
function tidy(container: HTMLElement): HTMLElement[] {
  const wrap = (node: ChildNode) => {
    const div = document.createElement("div");
    node.replaceWith(div);
    div.append(node);
  };
  const needsWork = Array.from(container.childNodes).some(
    (n) =>
      !(n instanceof HTMLElement) ||
      n.tagName !== "DIV" ||
      (!n.dataset.cue && Array.from(n.children).some((c) => c.tagName === "DIV")),
  );
  if (needsWork) {
    keepingSelection(() => {
      for (const child of Array.from(container.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
          if (child.textContent) wrap(child);
          else child.remove();
        } else if (!(child instanceof HTMLElement)) {
          child.remove();
        } else if (child.tagName === "BR") {
          wrap(child);
        } else if (child.tagName !== "DIV") {
          wrap(child);
        } else if (!child.dataset.cue && Array.from(child.children).some((c) => c.tagName === "DIV")) {
          const pieces = Array.from(child.childNodes).map((n) => {
            if (n instanceof HTMLElement && n.tagName === "DIV") return n;
            const div = document.createElement("div");
            div.append(n);
            return div;
          });
          child.replaceWith(...pieces);
        }
      }
    });
  }
  return Array.from(container.children) as HTMLElement[];
}

/**
 * A letra como documento: um `contentEditable` que o React não desenha. O DOM
 * é montado a partir das linhas só quando a mudança vem de fora; ao digitar,
 * o caminho é o inverso (o DOM é lido de volta em linhas), para o cursor nunca
 * pular.
 */
export function LyricsDocument({
  rows,
  version,
  readOnly,
  onChange,
  onSelection,
  onCueClick,
  onMoveCue,
  onRenamePart,
  onPartAction,
  renderToolbar,
}: LyricsDocumentProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const pendingCaret = useRef<{ index: number; offset: number } | null>(null);
  /** Instrução que recebe o foco quando o DOM for refeito (mover pelo teclado). */
  const pendingFocus = useRef<string | null>(null);
  const layoutRef = useRef<Layout>(EMPTY_LAYOUT);
  const [layout, setLayout] = useState<Layout>(EMPTY_LAYOUT);
  const [selection, setSelection] = useState<DocSelection | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; from: number; gap: number; partEnd?: { inside: boolean } } | null>(null);
  const [splitting, setSplitting] = useState<string | null>(null);
  const suppressClick = useRef(false);

  /**
   * Espaço entre partes, blocos coloridos, marcas de slide e nomes na margem:
   * recalculados a cada mudança, sem refazer o DOM.
   */
  const decorate = useCallback((current: WorshipRow[]) => {
    const container = containerRef.current;
    const wrapper = wrapperRef.current;
    if (!container || !wrapper) return;
    const { parts, slides } = deriveSong(current);
    const starts = new Set(parts.map((p) => p.rowId));
    const els = Array.from(container.children) as HTMLElement[];
    els.forEach((el, i) => el.classList.toggle(PART_GAP_CLASS, starts.has(el.dataset.rowId ?? "") && i > 0));

    // Medidas depois do espaço entre partes aplicado.
    const base = wrapper.getBoundingClientRect();
    const boxes = els.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top - base.top, bottom: r.bottom - base.top };
    });
    const indexOf = new Map(els.map((el, i) => [el.dataset.rowId ?? "", i]));
    /** Última linha com conteúdo antes de `end` (exclusivo). */
    const lastFilled = (start: number, end: number) => {
      let i = end - 1;
      while (i > start && isBlankRow(current[i])) i -= 1;
      return i;
    };
    const partBoxes: PartBox[] = [];
    parts.forEach((part, k) => {
      const start = indexOf.get(part.rowId);
      if (start === undefined || !boxes[start]) return;
      const outsideIndex = k + 1 < parts.length ? (indexOf.get(parts[k + 1].rowId) ?? els.length) : els.length;
      const end = outsideIndex;
      const last = lastFilled(start, end);
      partBoxes.push({ part, top: boxes[start].top, bottom: boxes[last].bottom, endIndex: last + 1, outsideIndex });
    });
    const slideBoxes: SlideBox[] = [];
    slides.forEach((slide, k) => {
      const start = indexOf.get(slide.rowId);
      if (start === undefined || !boxes[start]) return;
      const end = k + 1 < slides.length ? (indexOf.get(slides[k + 1].rowId) ?? els.length) : els.length;
      const last = lastFilled(start, end);
      slideBoxes.push({ index: slide.index, kind: parts[slide.part]?.kind ?? "VERSE", top: boxes[start].top, bottom: boxes[last].bottom });
    });
    const gaps = boxes.map((b, i) => (i === 0 ? b.top - 2 : (boxes[i - 1].bottom + b.top) / 2));
    if (boxes.length) gaps.push(boxes[boxes.length - 1].bottom + 2);
    const c = container.getBoundingClientRect();
    const next: Layout = { left: c.left - base.left, width: c.width, parts: partBoxes, slides: slideBoxes, gaps };
    layoutRef.current = next;
    setLayout(next);
  }, []);

  // Refaz o DOM quando o documento muda por fora.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.replaceChildren(...rowsRef.current.map(buildRow));
    decorate(rowsRef.current);
    const caret = pendingCaret.current;
    pendingCaret.current = null;
    if (caret) {
      const el = container.children[caret.index] as HTMLElement | undefined;
      const sel = window.getSelection();
      if (el && sel) {
        const text = el.firstChild?.nodeType === Node.TEXT_NODE ? el.firstChild : null;
        const range = document.createRange();
        if (text) range.setStart(text, Math.min(caret.offset, text.textContent?.length ?? 0));
        else range.setStart(el, 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
    const focusId = pendingFocus.current;
    pendingFocus.current = null;
    if (focusId) {
      container.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(focusId)}"] [data-cue-chip]`)?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  // A largura muda (janela, menu lateral, fonte carregando): as linhas quebram diferente.
  useEffect(() => {
    const container = containerRef.current;
    const onResize = () => decorate(rowsRef.current);
    window.addEventListener("resize", onResize);
    const observer = typeof ResizeObserver === "function" && container ? new ResizeObserver(onResize) : null;
    if (observer && container) observer.observe(container);
    return () => {
      window.removeEventListener("resize", onResize);
      observer?.disconnect();
    };
  }, [decorate]);

  /** Lê o que está na tela de volta em linhas. */
  const readDom = useCallback((): WorshipRow[] => {
    const container = containerRef.current;
    if (!container) return rowsRef.current;
    const els = tidy(container);
    const nodes: EditorNode[] = els.map((el) => ({
      id: el.dataset.rowId ?? null,
      kind: el.dataset.cue ? "cue" : "text",
      text: el.textContent ?? "",
    }));
    const next = rowsFromEditorNodes(nodes, rowsRef.current);
    els.forEach((el, i) => {
      el.dataset.rowId = next[i].id;
    });
    decorate(next);
    return next;
  }, [decorate]);

  const rowIndexOf = useCallback((node: Node | null, offset: number): number => {
    const container = containerRef.current;
    if (!container || !node) return -1;
    if (node === container) return Math.min(offset, container.children.length - 1);
    let current: Node | null = node;
    while (current && current.parentNode !== container) current = current.parentNode;
    return current ? Array.prototype.indexOf.call(container.children, current) : -1;
  }, []);

  // Seleção: avisa quem está fora e posiciona a barrinha.
  useEffect(() => {
    const onSelectionChange = () => {
      const container = containerRef.current;
      const wrapper = wrapperRef.current;
      const sel = window.getSelection();
      if (!container || !wrapper || !sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) {
        setSelection(null);
        onSelection(null);
        return;
      }
      const from = Math.max(0, rowIndexOf(range.startContainer, range.startOffset));
      let to = rowIndexOf(range.endContainer, range.endContainer === container ? range.endOffset - 1 : range.endOffset);
      // Seleção que termina no começo da linha seguinte (clique triplo) não inclui essa linha.
      if (!range.collapsed && to > from && range.endOffset === 0 && range.endContainer !== container) to -= 1;
      to = Math.max(from, to);
      const rect = typeof range.getBoundingClientRect === "function" ? range.getBoundingClientRect() : null;
      const base = wrapper.getBoundingClientRect();
      const next: DocSelection = {
        from,
        to,
        collapsed: range.collapsed,
        top: rect ? rect.top - base.top : 0,
        left: rect ? rect.left - base.left : 0,
      };
      setSelection(next);
      onSelection(next);
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [onSelection, rowIndexOf]);

  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    if (readOnly) return;
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    const sel = window.getSelection();
    if (sel && sel.rangeCount && !sel.getRangeAt(0).collapsed) sel.deleteFromDocument();
    if (!/\n/.test(text.trim())) {
      // Uma linha só: o próprio navegador insere (e mantém o desfazer).
      document.execCommand("insertText", false, text.replace(/\s+/g, " "));
      return;
    }
    const current = readDom();
    const container = containerRef.current;
    let index = current.length;
    let offset = 0;
    if (sel && sel.rangeCount && container) {
      const range = sel.getRangeAt(0);
      index = rowIndexOf(range.startContainer, range.startOffset);
      if (index < 0) index = current.length;
      const el = container.children[index];
      if (el) {
        const before = document.createRange();
        before.selectNodeContents(el);
        before.setEnd(range.startContainer, range.startOffset);
        offset = before.toString().length;
      }
    }
    const pasted = pasteLines(current, index, offset, text.trim());
    pendingCaret.current = { index: pasted.caretIndex, offset: pasted.caretOffset };
    onChange(pasted.rows, true);
  }

  /** Arrastar uma instrução: o vão mais perto do ponteiro é onde ela cai. */
  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (readOnly || event.button !== 0) return;
    const chip = (event.target as HTMLElement).closest<HTMLElement>("[data-cue-chip]");
    const row = chip?.closest<HTMLElement>("[data-cue]");
    const id = row?.dataset.rowId;
    const container = containerRef.current;
    const wrapper = wrapperRef.current;
    if (!chip || !row || !id || !container || !wrapper) return;
    // Sem isto o navegador começa a selecionar texto.
    event.preventDefault();
    chip.focus({ preventScroll: true });
    const from = Array.prototype.indexOf.call(container.children, row) as number;
    const startY = event.clientY;
    let dragging = false;
    let gap = from;
    let destination: "part-end" | undefined;

    const nearestGap = (clientY: number) => {
      const y = clientY - wrapper.getBoundingClientRect().top;
      const { gaps } = layoutRef.current;
      const partEnd = layoutRef.current.parts.find((part) => y >= part.bottom - 7 && y <= part.bottom + 34);
      if (partEnd) {
        const inside = y <= partEnd.bottom + 12;
        return {
          gap: inside ? partEnd.endIndex : partEnd.outsideIndex,
          partEnd: { inside },
        };
      }
      let best = from;
      gaps.forEach((g, k) => {
        if (Math.abs(g - y) < Math.abs((gaps[best] ?? Infinity) - y)) best = k;
      });
      return { gap: best, partEnd: undefined };
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging && Math.abs(e.clientY - startY) < DRAG_THRESHOLD) return;
      dragging = true;
      row.dataset.dragging = "1";
      const target = nearestGap(e.clientY);
      gap = target.gap;
      destination = target.partEnd?.inside ? "part-end" : undefined;
      setDrag({ id, from, gap, partEnd: target.partEnd });
      // Perto da borda da janela, a página rola junto.
      if (e.clientY < 64) window.scrollBy(0, -12);
      else if (e.clientY > window.innerHeight - 64) window.scrollBy(0, 12);
    };
    const finish = (commit: boolean) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey, true);
      delete row.dataset.dragging;
      setDrag(null);
      if (!dragging) return;
      // O clique que o navegador dispara ao soltar não abre a instrução; se ele não vier, o próximo vale.
      suppressClick.current = true;
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 0);
      if (commit && gap !== from && gap !== from + 1) {
        pendingFocus.current = id;
        onMoveCue(id, gap, destination);
      }
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish(false);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey, true);
  }

  /** Teclado na instrução: Enter edita, Alt+setas muda de lugar uma linha por vez. */
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    // Shift+Enter criaria quebra dentro da linha; aqui cada linha é um bloco.
    if (event.key === "Enter" && event.shiftKey) {
      event.preventDefault();
      return;
    }
    const chip = (event.target as HTMLElement).closest<HTMLElement>("[data-cue-chip]");
    const row = chip?.closest<HTMLElement>("[data-cue]");
    const id = row?.dataset.rowId;
    const container = containerRef.current;
    if (!chip || !row || !id || !container) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onCueClick(id);
      return;
    }
    if (readOnly || !event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    const index = Array.prototype.indexOf.call(container.children, row) as number;
    const to = event.key === "ArrowUp" ? index - 1 : index + 2;
    if (to < 0 || to > container.children.length) return;
    pendingFocus.current = id;
    onMoveCue(id, to);
  }

  const showToolbar = !readOnly && selection && !drag;

  return (
    <div ref={wrapperRef} className="relative px-6 pb-12 pt-9 sm:px-10">
      {/* Um bloco de fundo por parte, com a cor do tipo. */}
      {layout.parts.map(({ part, top, bottom }) => (
        <div
          key={`bloco-${part.rowId}`}
          aria-hidden="true"
          data-part-block={part.kind}
          className={`pointer-events-none absolute rounded-xl ${PART_TONE[part.kind].block}`}
          style={{ top: top - 8, height: bottom - top + 16, left: layout.left - 22, width: layout.width + 30 }}
        />
      ))}
      {/* Uma barra do começo ao fim de cada slide, com o número dele. */}
      {layout.slides.map((slide) => (
        <div
          key={`slide-${slide.index}`}
          aria-hidden="true"
          data-slide-mark={slide.index + 1}
          className="pointer-events-none absolute"
          style={{ top: slide.top + 2, height: Math.max(8, slide.bottom - slide.top - 4), left: layout.left - 13, width: layout.width + 13 }}
        >
          <span className={`absolute inset-y-0 left-0 w-[3px] rounded-full ${PART_TONE[slide.kind].bar}`} />
          <span className="absolute right-0 top-0 text-[10px] font-semibold tabular-nums leading-4 text-muted-foreground">
            {slide.index + 1}
          </span>
        </div>
      ))}
      {layout.parts.map(({ part, top }, partIndex) =>
        readOnly ? (
          <span
            key={part.rowId}
            aria-hidden="true"
            className={`pointer-events-none absolute left-6 w-24 select-none text-[11px] font-bold uppercase tracking-wider sm:left-10 ${PART_TONE[part.kind].label}`}
            style={{ top: top + 10 }}
          >
            {part.name}
          </span>
        ) : (
          <div key={part.rowId}>
            <PartNamePicker
              open={renaming === part.rowId}
              onOpenChange={(open) => setRenaming(open ? part.rowId : null)}
              name={part.name}
              kind={part.kind}
              parts={layout.parts.map((p) => p.part)}
              onPick={(choice) => onRenamePart(part.rowId, choice)}
            >
              <button
                type="button"
                aria-label={`Renomear a parte ${part.name}`}
                title="Clique para renomear"
                className={`group absolute left-4 flex max-w-[6.75rem] items-start gap-1 rounded px-2 py-0.5 text-left text-[11px] font-bold uppercase leading-4 tracking-wider hover:bg-background/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:left-8 ${PART_TONE[part.kind].label}`}
                style={{ top: top + 8 }}
              >
                <span className="min-w-0 break-words">{part.name}</span>
                <Pencil className="mt-0.5 h-3 w-3 flex-none opacity-0 group-hover:opacity-70 group-focus-visible:opacity-70" aria-hidden="true" />
              </button>
            </PartNamePicker>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Ações da parte ${part.name}`}
                  title={`Ações da parte ${part.name}`}
                  className="absolute h-8 w-8"
                  style={{ top: top + 3, left: layout.left + layout.width - 34 }}
                ><MoreHorizontal className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled={partIndex === 0} onSelect={() => onPartAction(part.rowId, "up")}>Mover parte para cima</DropdownMenuItem>
                <DropdownMenuItem disabled={partIndex === layout.parts.length - 1} onSelect={() => onPartAction(part.rowId, "down")}>Mover parte para baixo</DropdownMenuItem>
                <DropdownMenuSeparator />
                <PartNamePicker
                  open={splitting === part.rowId}
                  onOpenChange={(open) => setSplitting(open ? part.rowId : null)}
                  name={part.name}
                  kind={part.kind}
                  parts={layout.parts.map((p) => p.part)}
                  forcePick
                  onPick={(choice) => onPartAction(part.rowId, "split", choice)}
                >
                  <DropdownMenuItem onSelect={(event) => { event.preventDefault(); setSplitting(part.rowId); }}>Dividir parte neste ponto</DropdownMenuItem>
                </PartNamePicker>
                <DropdownMenuItem disabled={partIndex === 0} onSelect={() => onPartAction(part.rowId, "mergePrevious")}>Unir com a parte anterior</DropdownMenuItem>
                <DropdownMenuItem disabled={partIndex === layout.parts.length - 1} onSelect={() => onPartAction(part.rowId, "mergeNext")}>Unir com a próxima parte</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onPartAction(part.rowId, "cueStart")}>Adicionar anotação no início</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onPartAction(part.rowId, "cueEnd")}>Adicionar anotação no fim</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      )}
      {drag && layout.gaps[drag.gap] !== undefined && (
        <div
          aria-hidden="true"
          data-drop-indicator
          data-drop-target={drag.partEnd ? (drag.partEnd.inside ? "part-end-inside" : "part-end-outside") : "line"}
          className="pointer-events-none absolute z-30 flex items-center"
          style={{ top: layout.gaps[drag.gap] - 5, left: layout.left - 18, width: layout.width + 18 }}
        >
          <span className="h-2.5 w-2.5 flex-none rounded-full border-2 border-primary bg-background" />
          <span className="h-0.5 flex-1 rounded-full bg-primary" />
          {drag.partEnd && <span className="ml-2 rounded bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground">{drag.partEnd.inside ? "Fim da parte" : "Depois da parte"}</span>}
        </div>
      )}
      {showToolbar && (
        <div
          className="absolute z-20"
          style={{ top: Math.max(0, selection.top - 58), left: Math.max(8, Math.min(selection.left, 360)) }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {renderToolbar(selection)}
        </div>
      )}
      <div
        ref={containerRef}
        role="textbox"
        aria-multiline="true"
        aria-label="Letra da música"
        contentEditable={!readOnly}
        suppressContentEditableWarning
        spellCheck={false}
        className={`relative ml-28 min-h-[320px] whitespace-pre-wrap break-words pr-5 text-xl leading-[1.55] outline-none ${
          drag ? "[&_[data-cue-chip]]:cursor-grabbing [&_[data-dragging]]:opacity-40" : ""
        }`}
        onInput={() => onChange(readDom())}
        onPaste={handlePaste}
        onDrop={(e) => e.preventDefault()}
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
        onClick={(e) => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          const cue = (e.target as HTMLElement).closest<HTMLElement>("[data-cue]");
          if (cue?.dataset.rowId) onCueClick(cue.dataset.rowId);
        }}
      />
    </div>
  );
}
