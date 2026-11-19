// Extensões do editor do sermão. O JSON que sai de editor.getJSON() precisa caber exatamente no esquema que a API
// valida (apps/api/src/modules/sermons/sermon-document.ts): qualquer nó, atributo ou marca a mais é recusado com 400.
import { Extension, Node, mergeAttributes, type Extensions } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type Transaction } from "@tiptap/pm/state";
import { ReactNodeViewRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { VerseAttrs } from "../lib/document";
import type { CalloutKind } from "./block-colors";
import { CalloutView } from "./blocks/CalloutView";
import { PointView } from "./blocks/PointView";
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
              if (typeof id !== "string" || id === "" || seen.has(id)) {
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
      Tab: () => this.editor.commands.sinkListItem(this.name),
      "Shift-Tab": () => this.editor.commands.liftListItem(this.name),
    };
  },
});

const Point = Node.create({
  name: "point",
  group: "block",
  content: "inline*",
  defining: true,
  addAttributes() {
    return idAttribute;
  },
  parseHTML() {
    return [{ tag: 'div[data-type="point"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-type": "point" }, HTMLAttributes), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(PointView);
  },
});

const VERSE_KEYS = ["reference", "book", "chapter", "verseStart", "verseEnd", "translation", "verses"] as const;

function readVerseData(el: HTMLElement): Record<string, unknown> {
  try {
    const data = JSON.parse(el.getAttribute("data-verse") ?? "{}");
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
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
        parseHTML: (el: HTMLElement) => readVerseData(el)[key] ?? (key === "verses" ? [] : key === "reference" ? "" : null),
      };
    }
    return attrs;
  },
  parseHTML() {
    return [{ tag: 'div[data-type="verse"]' }];
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
  Verse,
  callout("illustration"),
  callout("application"),
  callout("privateNote"),
  UniqueBlockId,
  SermonCommands,
];
