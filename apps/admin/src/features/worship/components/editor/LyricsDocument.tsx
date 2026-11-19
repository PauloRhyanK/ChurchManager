import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { CUE_TARGET_LABEL, deriveSong, type WorshipRow } from "../../lib/document";
import { pasteLines, rowsFromEditorNodes, type EditorNode } from "../../lib/row-ops";

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
  /** A barrinha flutuante, desenhada sobre o trecho selecionado. */
  renderToolbar: (selection: DocSelection) => ReactNode;
}

const CHIP_CLASS =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-amber-100 px-2.5 py-0.5 align-middle text-[13px] leading-5 text-amber-900 hover:bg-amber-200";
const PART_GAP_CLASS = "mt-7";

function buildRow(row: WorshipRow): HTMLElement {
  const el = document.createElement("div");
  el.dataset.rowId = row.id;
  if (row.type === "cue") {
    el.dataset.cue = "1";
    el.contentEditable = "false";
    const chip = document.createElement("span");
    chip.className = CHIP_CLASS;
    const who = document.createElement("b");
    who.textContent = CUE_TARGET_LABEL[row.target ?? "ALL"];
    chip.append(who, ` ${row.text ?? ""}`);
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
  renderToolbar,
}: LyricsDocumentProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const pendingCaret = useRef<{ index: number; offset: number } | null>(null);
  const [labels, setLabels] = useState<{ id: string; name: string; top: number }[]>([]);
  const [selection, setSelection] = useState<DocSelection | null>(null);

  /** Espaço entre partes e nomes na margem: recalculado a cada mudança, sem refazer o DOM. */
  const decorate = useCallback((current: WorshipRow[]) => {
    const container = containerRef.current;
    if (!container) return;
    const { parts } = deriveSong(current);
    const starts = new Map(parts.map((p) => [p.rowId, p.name]));
    const next: { id: string; name: string; top: number }[] = [];
    Array.from(container.children).forEach((child, i) => {
      const el = child as HTMLElement;
      const name = starts.get(el.dataset.rowId ?? "");
      el.classList.toggle(PART_GAP_CLASS, !!name && i > 0);
      if (name) next.push({ id: el.dataset.rowId ?? String(i), name, top: el.offsetTop });
    });
    setLabels(next);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  useEffect(() => {
    const onResize = () => decorate(rowsRef.current);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
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
    rowsRef.current = next;
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

  const showToolbar = !readOnly && selection && !selection.collapsed;

  return (
    <div ref={wrapperRef} className="relative px-6 pb-12 pt-9 sm:px-10">
      {labels.map((label) => (
        <span
          key={label.id}
          aria-hidden="true"
          className="pointer-events-none absolute left-6 w-24 select-none text-[11px] font-bold uppercase tracking-wider text-muted-foreground sm:left-10"
          style={{ top: label.top + 10 }}
        >
          {label.name}
        </span>
      ))}
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
        className="ml-28 min-h-[320px] whitespace-pre-wrap break-words text-xl leading-[1.55] outline-none"
        onInput={() => onChange(readDom())}
        onPaste={handlePaste}
        onDrop={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          // Shift+Enter criaria quebra dentro da linha; aqui cada linha é um bloco.
          if (e.key === "Enter" && e.shiftKey) e.preventDefault();
        }}
        onClick={(e) => {
          const cue = (e.target as HTMLElement).closest<HTMLElement>("[data-cue]");
          if (cue?.dataset.rowId) onCueClick(cue.dataset.rowId);
        }}
      />
    </div>
  );
}
