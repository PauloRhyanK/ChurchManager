import { Editor, type JSONContent } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import type { VerseAttrs } from "../lib/document";
import { EXAMPLE_DOC } from "../lib/sermon-example";
import { sermonExtensions } from "./extensions";

const editors: Editor[] = [];
function makeEditor(content: JSONContent | string = { type: "doc", content: [{ type: "paragraph" }] }) {
  const editor = new Editor({ extensions: sermonExtensions, content });
  editors.push(editor);
  return editor;
}
afterEach(() => {
  while (editors.length) editors.pop()!.destroy();
});

const MANUAL_VERSE: Omit<VerseAttrs, "id"> = {
  reference: "João 3:16",
  book: null,
  chapter: null,
  verseStart: null,
  verseEnd: null,
  translation: null,
  verses: [{ number: null, text: "Porque Deus amou o mundo de tal maneira." }],
};

const top = (editor: Editor) => editor.getJSON().content ?? [];

// Espelho das regras de apps/api/src/modules/sermons/sermon-document.ts (só a forma: tipos, chaves, marcas).
function allowedShape(doc: JSONContent): string[] {
  const errors: string[] = [];
  const only = (o: object, allowed: string[], path: string) => {
    for (const k of Object.keys(o)) if (!allowed.includes(k)) errors.push(`${path}: chave "${k}"`);
  };
  const inline = (n: JSONContent, path: string) => {
    if (n.type === "hardBreak") return only(n, ["type"], path);
    if (n.type !== "text") return errors.push(`${path}: inline "${n.type}"`);
    only(n, ["type", "text", "marks"], path);
    if (!n.text) errors.push(`${path}: texto vazio`);
    (n.marks ?? []).forEach((m, i) => {
      if (m.type !== "bold" && m.type !== "italic") errors.push(`${path}.marks[${i}]: marca "${m.type}"`);
      only(m, ["type"], `${path}.marks[${i}]`);
    });
  };
  const inlines = (n: JSONContent, path: string) => (n.content ?? []).forEach((c, i) => inline(c, `${path}[${i}]`));
  const idAttrs = (n: JSONContent, path: string) => {
    only(n.attrs ?? {}, ["id"], `${path}.attrs`);
    if (typeof n.attrs?.id !== "string" || n.attrs.id.length === 0 || n.attrs.id.length > 36) errors.push(`${path}: id`);
  };
  const inner = (n: JSONContent, path: string) => {
    if (!["paragraph", "bulletList", "orderedList"].includes(n.type ?? "")) return errors.push(`${path}: interno "${n.type}"`);
    block(n, path);
  };
  const listItems = (n: JSONContent, path: string) =>
    (n.content ?? []).forEach((li, i) => {
      const p = `${path}[${i}]`;
      if (li.type !== "listItem") return errors.push(`${p}: item "${li.type}"`);
      only(li, ["type", "content"], p);
      (li.content ?? []).forEach((c, j) => inner(c, `${p}[${j}]`));
    });
  const block = (n: JSONContent, path: string): void => {
    switch (n.type) {
      case "paragraph":
        only(n, ["type", "content"], path);
        return inlines(n, path);
      case "heading":
        only(n, ["type", "attrs", "content"], path);
        only(n.attrs ?? {}, ["id", "level"], `${path}.attrs`);
        if (n.attrs?.level !== 2 && n.attrs?.level !== 3) errors.push(`${path}: nível ${n.attrs?.level}`);
        if (typeof n.attrs?.id !== "string" || !n.attrs.id) errors.push(`${path}: id`);
        return inlines(n, path);
      case "point":
        only(n, ["type", "attrs", "content"], path);
        idAttrs(n, path);
        return inlines(n, path);
      case "bulletList":
        only(n, ["type", "content"], path);
        return listItems(n, path);
      case "orderedList":
        only(n, ["type", "attrs", "content"], path);
        only(n.attrs ?? {}, ["start", "type"], `${path}.attrs`);
        return listItems(n, path);
      case "verse":
        only(n, ["type", "attrs"], path);
        only(n.attrs ?? {}, ["id", "reference", "book", "chapter", "verseStart", "verseEnd", "translation", "verses"], `${path}.attrs`);
        return;
      case "illustration":
      case "application":
      case "privateNote":
        only(n, ["type", "attrs", "content"], path);
        idAttrs(n, path);
        return (n.content ?? []).forEach((c, i) => inner(c, `${path}[${i}]`));
      default:
        errors.push(`${path}: bloco "${n.type}"`);
    }
  };
  only(doc, ["type", "content"], "doc");
  (doc.content ?? []).forEach((c, i) => block(c, `doc[${i}]`));
  return errors;
}

function types(node: JSONContent, out = new Set<string>()): Set<string> {
  if (node.type) out.add(node.type);
  for (const m of node.marks ?? []) out.add(`mark:${m.type}`);
  for (const c of node.content ?? []) types(c, out);
  return out;
}

describe("sermonExtensions", () => {
  it("insertPoint cria um point com id", () => {
    const editor = makeEditor();
    expect(editor.commands.insertPoint()).toBe(true);
    const point = top(editor).find((n) => n.type === "point");
    expect(point).toBeDefined();
    expect(typeof point!.attrs!.id).toBe("string");
    expect(point!.attrs!.id.length).toBeGreaterThan(0);
  });

  it("insertVerse cria o nó com os atributos", () => {
    const editor = makeEditor();
    editor.commands.insertVerse(MANUAL_VERSE);
    const verse = top(editor).find((n) => n.type === "verse");
    expect(verse).toBeDefined();
    const { id, ...rest } = verse!.attrs as VerseAttrs;
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
    expect(rest).toEqual(MANUAL_VERSE);
  });

  it("updateVerse troca os atributos do versículo pelo id", () => {
    const editor = makeEditor(EXAMPLE_DOC);
    editor.commands.updateVerse("v2", MANUAL_VERSE);
    const verses = top(editor).filter((n) => n.type === "verse");
    expect(verses[1].attrs).toEqual({ id: "v2", ...MANUAL_VERSE });
    expect(verses[0].attrs!.reference).toBe("João 8:12");
  });

  it("insertCallout('privateNote') cria o bloco com um parágrafo dentro", () => {
    const editor = makeEditor();
    editor.commands.insertCallout("privateNote");
    const note = top(editor).find((n) => n.type === "privateNote");
    expect(note).toBeDefined();
    expect(typeof note!.attrs!.id).toBe("string");
    expect(note!.content).toEqual([{ type: "paragraph" }]);
  });

  it("ids repetidos ficam diferentes depois da primeira transação", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        { type: "point", attrs: { id: "igual" }, content: [{ type: "text", text: "Um" }] },
        { type: "point", attrs: { id: "igual" }, content: [{ type: "text", text: "Dois" }] },
      ],
    });
    editor.commands.insertContentAt(editor.state.doc.content.size, { type: "paragraph" });
    const ids = top(editor)
      .filter((n) => n.type === "point")
      .map((n) => n.attrs!.id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe("igual");
    expect(ids[1]).not.toBe("igual");
    expect(ids[1]).toEqual(expect.any(String));
  });

  it("o documento de exemplo volta igual em getJSON (ida e volta)", () => {
    const editor = makeEditor(EXAMPLE_DOC);
    expect(editor.getJSON()).toEqual(EXAMPLE_DOC);
  });

  it("HTML colado com <img> e <h1> não vira image nem heading nível 1", () => {
    const editor = makeEditor();
    editor.commands.setContent('<h1>Grande</h1><p>texto <img src="x.png"> fim</p><h2>Seção</h2>');
    const all = types(editor.getJSON());
    expect(all.has("image")).toBe(false);
    const headings = top(editor).filter((n) => n.type === "heading");
    expect(headings.map((h) => h.attrs!.level)).toEqual([2]);
    expect(allowedShape(editor.getJSON())).toEqual([]);
  });

  it("um documento com todos os recursos da barra só tem o que o servidor aceita", () => {
    const editor = makeEditor(
      "<h2>Seção</h2><h3>Subtítulo</h3><p>um <strong>forte</strong> e <em>leve</em></p><p>primeiro</p><p>segundo</p><p>final</p>",
    );
    // Lista com marcadores no 4º bloco, numerada no 5º.
    const posOf = (index: number) => {
      let pos = 0;
      editor.state.doc.forEach((node, offset, i) => {
        if (i === index) pos = offset + 1;
      });
      return pos;
    };
    editor.chain().setTextSelection(posOf(3)).toggleBulletList().run();
    editor.chain().setTextSelection(posOf(4)).toggleOrderedList().run();
    editor.chain().setTextSelection(posOf(5)).toggleBold().insertContent("negrito ").toggleItalic().insertContent("e itálico").run();
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    editor.commands.insertPoint();
    editor.commands.insertContent("Primeiro ponto");
    editor.commands.insertVerse(MANUAL_VERSE);
    editor.commands.insertCallout("illustration");
    editor.commands.insertContent("Uma história");
    editor.commands.insertCallout("application");
    editor.commands.toggleBulletList();
    editor.commands.insertContent("faça isso");
    editor.commands.insertCallout("privateNote");
    editor.commands.insertContent("lembrete");
    editor.commands.setHardBreak();
    editor.commands.insertContent("outra linha");

    const json = editor.getJSON();
    const all = types(json);
    for (const t of [
      "heading",
      "paragraph",
      "bulletList",
      "orderedList",
      "listItem",
      "point",
      "verse",
      "illustration",
      "application",
      "privateNote",
      "hardBreak",
      "mark:bold",
      "mark:italic",
    ]) {
      expect(all, t).toContain(t);
    }
    expect(allowedShape(json)).toEqual([]);
    const levels = top(editor)
      .filter((n) => n.type === "heading")
      .map((n) => n.attrs!.level);
    expect(levels).toEqual([2, 3]);
  });
});
