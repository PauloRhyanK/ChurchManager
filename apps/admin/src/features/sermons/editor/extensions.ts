// Extensões do editor do sermão. O JSON que sai de editor.getJSON() precisa caber exatamente no esquema que a API
// valida (apps/api/src/modules/sermons/sermon-document.ts): qualquer nó, atributo ou marca a mais é recusado com 400.
import { Extension, Node, mergeAttributes, type Extensions, type JSONContent } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { sinkListItem } from "@tiptap/pm/schema-list";
import type { EditorView } from "@tiptap/pm/view";
import { NodeSelection, Plugin, PluginKey, TextSelection, type Transaction } from "@tiptap/pm/state";
import { ReactNodeViewRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { VerseAttrs } from "../lib/document";
import type { CalloutKind } from "./block-colors";
import { CalloutView } from "./blocks/CalloutView";
import { VerseView } from "./blocks/VerseView";

export type ManualVerseAttrs = Omit<VerseAttrs, "id">;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    sermon: {
      /** Transforma a linha atual em Ponto; se não der, cria um Ponto vazio depois do bloco atual. */
      insertPoint: () => ReturnType;
      insertVerse: (attrs: ManualVerseAttrs) => ReturnType;
      updateVerse: (id: string, attrs: ManualVerseAttrs) => ReturnType;
      insertCallout: (kind: CalloutKind) => ReturnType;
    };
  }
}

const ID_TYPES = new Set(["heading", "point", "verse", "illustration", "application", "privateNote"]);
// Limites do validador do servidor (DOC_LIMITS em apps/api/src/modules/sermons/sermon-document.ts).
const ID_MAX = 36;
const DEPTH_MAX = 8;
const REFERENCE_MAX = 120;
const VERSES_MAX = 200;
const ORDERED_TYPE_MAX = 8;

const isValidId = (id: unknown): id is string => typeof id === "string" && id !== "" && id.length <= ID_MAX;

/**
 * Nível mais fundo que um texto teria no documento, contado como o servidor conta: a raiz `doc` é o nível 1,
 * cada nó desce um nível e o texto fica um nível abaixo do seu bloco de texto (mesmo se ele estiver vazio).
 */
export function maxTextDepth(doc: JSONContent): number {
  const TEXTBLOCKS = new Set(["paragraph", "heading", "point"]);
  let max = 1;
  const walk = (node: JSONContent, depth: number) => {
    max = Math.max(max, depth);
    if (node.type && TEXTBLOCKS.has(node.type)) max = Math.max(max, depth + 1);
    for (const child of node.content ?? []) walk(child, depth + 1);
  };
  walk(doc, 1);
  return max;
}
const INNER_CONTENT = "(paragraph | bulletList | orderedList)";

export function newBlockId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${hex(3)}-${hex(12)}`;
}

// O id não é copiado quando o bloco é dividido (Enter no meio): o novo bloco recebe um id próprio.
const idAttribute = {
  id: {
    default: null,
    keepOnSplit: false,
    parseHTML: (el: HTMLElement) => el.getAttribute("data-id"),
    renderHTML: (attrs: Record<string, unknown>) => (attrs.id ? { "data-id": attrs.id } : {}),
  },
};

/** Dá um id novo a todo bloco sem id ou com id que já apareceu antes no documento. */
const UniqueBlockId = Extension.create({
  name: "uniqueBlockId",
  addGlobalAttributes() {
    return [{ types: ["heading"], attributes: idAttribute }];
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("uniqueBlockId"),
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((t) => t.docChanged)) return null;
          const tr = newState.tr;
          const seen = new Set<string>();
          newState.doc.descendants((node, pos) => {
            if (ID_TYPES.has(node.type.name)) {
              const id = node.attrs.id;
              if (!isValidId(id) || seen.has(id)) {
                const fresh = newBlockId();
                tr.setNodeAttribute(pos, "id", fresh);
                seen.add(fresh);
              } else {
                seen.add(id);
              }
            }
            return !node.isTextblock;
          });
          return tr.docChanged ? tr : null;
        },
      }),
    ];
  },
});

/**
 * Lista numerada só com atributos que o servidor aceita: `start` inteiro a partir de 1 (o "0. " digitado ou
 * `<ol start="0">` colado viram 1) e `type` nulo ou texto de até 8 caracteres.
 */
const SafeOrderedList = Extension.create({
  name: "safeOrderedList",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("safeOrderedList"),
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((t) => t.docChanged)) return null;
          const tr = newState.tr;
          newState.doc.descendants((node, pos) => {
            if (node.type.name === "orderedList") {
              const { start, type } = node.attrs;
              if (!(Number.isInteger(start) && start >= 1)) tr.setNodeAttribute(pos, "start", 1);
              if (type !== null && !(typeof type === "string" && type.length <= ORDERED_TYPE_MAX)) {
                tr.setNodeAttribute(pos, "type", null);
              }
            }
            return !node.isTextblock;
          });
          return tr.docChanged ? tr : null;
        },
      }),
    ];
  },
});

// Item de lista só com parágrafo e listas dentro (o do StarterKit aceita qualquer bloco, e o servidor não).
const SermonListItem = Node.create({
  name: "listItem",
  content: `paragraph ${INNER_CONTENT}*`,
  defining: true,
  parseHTML() {
    return [{ tag: "li" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["li", mergeAttributes(HTMLAttributes), 0];
  },
  addKeyboardShortcuts() {
    return {
      Enter: () => this.editor.commands.splitListItem(this.name),
      // Recusa (sem tirar o foco do editor) quando descer o item passaria do limite de níveis do servidor.
      Tab: () => {
        const { state } = this.editor;
        let after: PMNode | null = null;
        if (!sinkListItem(state.schema.nodes[this.name])(state, (tr) => (after = tr.doc))) return false;
        if (after === null || maxTextDepth((after as PMNode).toJSON()) > DEPTH_MAX) return true;
        return this.editor.commands.sinkListItem(this.name);
      },
      "Shift-Tab": () => this.editor.commands.liftListItem(this.name),
    };
  },
});

// Sem node view: o número ("1.", "2.") é um contador de CSS (sermon-editor.css), não texto do documento.
// Um h2 simples deixa o navegador posicionar o cursor no clique como em qualquer texto.
const Point = Node.create({
  name: "point",
  group: "block",
  content: "inline*",
  defining: true,
  addAttributes() {
    return idAttribute;
  },
  parseHTML() {
    // Antes da regra de h2 do título (prioridade 50).
    return [{ tag: 'h2[data-type="point"]', priority: 100 }, { tag: 'div[data-type="point"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["h2", mergeAttributes({ "data-type": "point" }, HTMLAttributes), 0];
  },
});

/**
 * Enter em Ponto e título: no fim cria um parágrafo vazio abaixo (com o cursor); no começo de um bloco
 * com texto cria um parágrafo vazio acima e o cursor fica no bloco. No meio, divide como de costume.
 */
const TitleEnter = Extension.create({
  name: "titleEnter",
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Enter: () =>
        this.editor.commands.command(({ tr, state }) => {
          const { selection } = tr;
          const { $from } = selection;
          if (!selection.empty || $from.depth !== 1) return false;
          const parent = $from.parent;
          if (parent.type.name !== "point" && parent.type.name !== "heading") return false;
          const paragraph = state.schema.nodes.paragraph.create();
          if ($from.parentOffset === parent.content.size) {
            const after = $from.after(1);
            tr.insert(after, paragraph).setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView();
            return true;
          }
          if ($from.parentOffset === 0) {
            tr.insert($from.before(1), paragraph).scrollIntoView();
            return true;
          }
          return false;
        }),
    };
  },
});

const VERSE_KEYS = ["reference", "book", "chapter", "verseStart", "verseEnd", "translation", "verses"] as const;

const intOrNull = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER) =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null;

/** Lê o `data-verse` colado e o ajusta ao esquema do servidor; null quando não dá para virar um Versículo válido. */
function readVerseData(el: HTMLElement): Omit<VerseAttrs, "id"> | null {
  let data: unknown;
  try {
    data = JSON.parse(el.getAttribute("data-verse") ?? "");
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  const reference = typeof d.reference === "string" ? d.reference.trim().slice(0, REFERENCE_MAX) : "";
  if (reference === "" || !Array.isArray(d.verses)) return null;
  const verses: VerseAttrs["verses"] = [];
  for (const v of d.verses.slice(0, VERSES_MAX)) {
    if (!v || typeof v !== "object" || typeof (v as { text?: unknown }).text !== "string") return null;
    verses.push({ number: intOrNull((v as { number?: unknown }).number, 1), text: (v as { text: string }).text });
  }
  const translation =
    typeof d.translation === "string" && d.translation !== "" && d.translation.length <= ID_MAX ? d.translation : null;
  return {
    reference,
    book: intOrNull(d.book, 1, 66),
    chapter: intOrNull(d.chapter, 1),
    verseStart: intOrNull(d.verseStart, 1),
    verseEnd: intOrNull(d.verseEnd, 1),
    translation,
    verses,
  };
}

const Verse = Node.create({
  name: "verse",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    const attrs: Record<string, object> = { ...idAttribute };
    for (const key of VERSE_KEYS) {
      attrs[key] = {
        default: key === "verses" ? [] : key === "reference" ? "" : null,
        rendered: false,
        parseHTML: (el: HTMLElement) => readVerseData(el)?.[key] ?? null,
      };
    }
    return attrs;
  },
  parseHTML() {
    // Sem um Versículo válido no `data-verse`, o elemento não vira Versículo (o texto de dentro entra como texto comum).
    return [{ tag: 'div[data-type="verse"]', getAttrs: (el) => (readVerseData(el) ? null : false) }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const data = Object.fromEntries(VERSE_KEYS.map((k) => [k, node.attrs[k]]));
    const text = (node.attrs.verses as VerseAttrs["verses"]).map((v) => v.text).join(" ");
    return [
      "div",
      mergeAttributes({ "data-type": "verse", "data-verse": JSON.stringify(data) }, HTMLAttributes),
      ["blockquote", text],
      ["p", ["strong", node.attrs.reference as string]],
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(VerseView);
  },
});

function callout(name: CalloutKind) {
  return Node.create({
    name,
    group: "block",
    content: `${INNER_CONTENT}+`,
    defining: true,
    addAttributes() {
      return idAttribute;
    },
    parseHTML() {
      return [{ tag: `div[data-type="${name}"]` }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes({ "data-type": name }, HTMLAttributes), 0];
    },
    addNodeView() {
      return ReactNodeViewRenderer(CalloutView);
    },
  });
}

/**
 * Põe `node` no nível de cima do documento, logo depois do bloco onde está o cursor
 * (ou no lugar dele, se for um parágrafo vazio). Devolve a posição onde o nó ficou.
 */
function placeTopLevel(tr: Transaction, node: PMNode): number {
  const { selection } = tr;
  const { $from } = selection;
  let at: number;
  if ($from.depth >= 1) {
    const current = $from.node(1);
    const before = $from.before(1);
    if (current.type.name === "paragraph" && current.content.size === 0) {
      tr.replaceWith(before, before + current.nodeSize, node);
      at = before;
    } else {
      at = $from.after(1);
      tr.insert(at, node);
    }
  } else {
    at = selection.to;
    tr.insert(at, node);
  }
  return at;
}

/** Cursor depois do bloco em `at`; se não houver nada depois, cria um parágrafo para o cursor. */
function cursorAfter(tr: Transaction, at: number) {
  const end = at + tr.doc.nodeAt(at)!.nodeSize;
  if (end >= tr.doc.content.size) tr.insert(end, tr.doc.type.schema.nodes.paragraph.create());
  tr.setSelection(TextSelection.near(tr.doc.resolve(end + 1)));
}

/**
 * Sem foco, a seleção nunca fica num Versículo inteiro (seleção de nó). Com ela, o primeiro clique no texto ao
 * voltar ao editor era desfeito: o ProseMirror redesenha a seleção de nó ao receber o foco e o cursor caía no
 * começo do bloco seguinte ao Versículo (no Chromium, com o documento começando por um Versículo).
 */
const TextSelectionWhenBlurred = Extension.create({
  name: "textSelectionWhenBlurred",
  onCreate() {
    leaveNodeSelection(this.editor.view);
  },
  onBlur() {
    leaveNodeSelection(this.editor.view);
  },
});

function leaveNodeSelection(view: EditorView) {
  const { state } = view;
  if (!(state.selection instanceof NodeSelection)) return;
  const $after = state.doc.resolve(state.selection.to);
  const text = TextSelection.findFrom($after, 1, true) ?? TextSelection.findFrom($after, -1, true);
  if (text) view.dispatch(state.tr.setSelection(text).setMeta("addToHistory", false));
}

const SermonCommands = Extension.create({
  name: "sermonCommands",
  addCommands() {
    return {
      insertPoint:
        () =>
        ({ tr, state, dispatch }) => {
          const point = state.schema.nodes.point;
          if (!dispatch) return true;
          const { $from } = tr.selection;
          const parent = $from.depth === 1 ? $from.parent.type.name : null;
          if (parent === "paragraph" || parent === "heading") {
            tr.setNodeMarkup($from.before(1), point, { id: newBlockId() });
            return true;
          }
          const at = placeTopLevel(tr, point.create({ id: newBlockId() }));
          tr.setSelection(TextSelection.create(tr.doc, at + 1));
          return true;
        },
      insertVerse:
        (attrs) =>
        ({ tr, state, dispatch }) => {
          if (!dispatch) return true;
          const at = placeTopLevel(tr, state.schema.nodes.verse.create({ ...attrs, id: newBlockId() }));
          cursorAfter(tr, at);
          return true;
        },
      updateVerse:
        (id, attrs) =>
        ({ tr, dispatch }) => {
          let found: number | null = null;
          tr.doc.forEach((node, offset) => {
            if (found === null && node.type.name === "verse" && node.attrs.id === id) found = offset;
          });
          if (found === null) return false;
          if (dispatch) tr.setNodeMarkup(found, undefined, { ...attrs, id });
          return true;
        },
      insertCallout:
        (kind) =>
        ({ tr, state, dispatch }) => {
          if (!dispatch) return true;
          const node = state.schema.nodes[kind].create({ id: newBlockId() }, state.schema.nodes.paragraph.create());
          const at = placeTopLevel(tr, node);
          tr.setSelection(TextSelection.create(tr.doc, at + 2));
          return true;
        },
    };
  },
});

export const sermonExtensions: Extensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    // Fora do esquema do servidor: blocos e marcas que a API recusaria.
    blockquote: false,
    code: false,
    codeBlock: false,
    strike: false,
    horizontalRule: false,
    link: false,
    underline: false,
    // Substituído por SermonListItem (o original aceita títulos, Pontos e blocos dentro de um item).
    listItem: false,
  }),
  SermonListItem,
  Point,
  TitleEnter,
  Verse,
  callout("illustration"),
  callout("application"),
  callout("privateNote"),
  UniqueBlockId,
  SafeOrderedList,
  TextSelectionWhenBlurred,
  SermonCommands,
];
