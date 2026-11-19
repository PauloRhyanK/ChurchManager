import { Editor, type JSONContent } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import type { VerseAttrs } from "../lib/document";
import { EXAMPLE_DOC } from "../lib/sermon-example";
import { maxTextDepth, sermonExtensions } from "./extensions";

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
        if (n.attrs?.start !== undefined && !(Number.isInteger(n.attrs.start) && n.attrs.start >= 1)) {
          errors.push(`${path}: start ${n.attrs.start}`);
        }
        if (n.attrs?.type != null && !(typeof n.attrs.type === "string" && n.attrs.type.length <= 8)) {
          errors.push(`${path}: type ${n.attrs.type}`);
        }
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
  if (maxTextDepth(doc) > 8) errors.push(`doc: profundidade ${maxTextDepth(doc)}`);
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

  it("lista numerada colada com start/type inválidos sai com atributos aceitos", () => {
    for (const html of ['<ol start="0"><li>a</li></ol>', '<ol start="abc"><li>a</li></ol>', '<ol type="aaaaaaaaaaaa"><li>a</li></ol>']) {
      const editor = makeEditor();
      editor.commands.setContent(html);
      const list = top(editor).find((n) => n.type === "orderedList");
      expect(list, html).toBeDefined();
      expect(allowedShape(editor.getJSON()), html).toEqual([]);
    }
  });

  it('digitar "0. " cria lista numerada começando em 1', () => {
    const editor = makeEditor("<p>0.</p>");
    const pos = editor.state.doc.content.size - 1;
    editor.commands.setTextSelection(pos);
    const handled = editor.view.someProp("handleTextInput", (f) => f(editor.view, pos, pos, " ", () => editor.state.tr));
    expect(handled).toBe(true);
    const list = top(editor).find((n) => n.type === "orderedList");
    expect(list?.attrs?.start).toBe(1);
    expect(allowedShape(editor.getJSON())).toEqual([]);
  });

  it("maxTextDepth conta os níveis como o servidor", () => {
    // Raiz 1; parágrafo/Ponto 2, texto 3; bloco 2, parágrafo 3, texto 4.
    expect(maxTextDepth(EXAMPLE_DOC)).toBe(4);
    expect(maxTextDepth({ type: "doc", content: [{ type: "paragraph" }] })).toBe(3);
  });

  describe("Tab respeita o limite de 8 níveis", () => {
    const li = (text: string, ...rest: JSONContent[]): JSONContent => ({
      type: "listItem",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }, ...rest],
    });
    const ul = (...items: JSONContent[]): JSONContent => ({ type: "bulletList", content: items });
    const ill = (...content: JSONContent[]): JSONContent => ({ type: "illustration", attrs: { id: "i1" }, content });
    const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });

    function tabAt(content: JSONContent, text: string) {
      const editor = makeEditor(content);
      let target = -1;
      editor.state.doc.descendants((node, pos) => {
        if (node.isText && node.text === text) target = pos + 1;
      });
      editor.commands.setTextSelection(target);
      const before = editor.getJSON();
      editor.commands.keyboardShortcut("Tab");
      return { before, after: editor.getJSON() };
    }

    it("no nível de cima: o 3º nível é recusado", () => {
      const start = doc(ul(li("a", ul(li("b"), li("c")))));
      expect(maxTextDepth(start)).toBe(7);
      const { before, after } = tabAt(start, "c");
      expect(after).toEqual(before);
    });

    it("no nível de cima: descer para o 2º nível pode", () => {
      const { before, after } = tabAt(doc(ul(li("a"), li("b"))), "b");
      expect(after).not.toEqual(before);
      expect(maxTextDepth(after)).toBe(7);
      expect(allowedShape(after)).toEqual([]);
    });

    it("dentro de um bloco: o 3º nível é recusado", () => {
      const start = doc(ill(ul(li("a", ul(li("b"), li("c"))))));
      expect(maxTextDepth(start)).toBe(8);
      const { before, after } = tabAt(start, "c");
      expect(after).toEqual(before);
    });

    it("dentro de um bloco: descer para o 2º nível pode", () => {
      const { before, after } = tabAt(doc(ill(ul(li("a"), li("b")))), "b");
      expect(after).not.toEqual(before);
      expect(maxTextDepth(after)).toBe(8);
      expect(allowedShape(after)).toEqual([]);
    });
  });

  describe("nenhuma transação passa do limite de 8 níveis", () => {
    const li = (text: string, ...rest: JSONContent[]): JSONContent => ({
      type: "listItem",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }, ...rest],
    });
    const ul = (...items: JSONContent[]): JSONContent => ({ type: "bulletList", content: items });
    const ill = (...content: JSONContent[]): JSONContent => ({ type: "illustration", attrs: { id: "i1" }, content });
    const p = (text: string): JSONContent => ({ type: "paragraph", content: [{ type: "text", text }] });
    // Já no limite: os parágrafos do item interno estão no nível 7 e o texto no 8. O segundo parágrafo do item
    // pode virar lista ("- " ou "1. "), o que desceria mais dois níveis.
    const atLimit = (last: string): JSONContent => ({
      type: "doc",
      content: [ill(ul(li("a", ul({ type: "listItem", content: [p("x"), p(last)] }))))],
    });

    function typeAtEnd(editor: Editor, text: string, typed: string) {
      let pos = -1;
      editor.state.doc.descendants((node, p) => {
        if (node.isText && node.text === text) pos = p + node.nodeSize;
      });
      editor.commands.setTextSelection(pos);
      editor.view.someProp("handleTextInput", (f) => f(editor.view, pos, pos, typed, () => editor.state.tr));
    }

    for (const marker of ["-", "1."]) {
      it(`digitar "${marker} " num item já no limite não cria outra lista dentro`, () => {
        const editor = makeEditor(atLimit(marker));
        expect(maxTextDepth(editor.getJSON())).toBe(8);
        typeAtEnd(editor, marker, " ");
        expect(maxTextDepth(editor.getJSON())).toBeLessThanOrEqual(8);
        expect(allowedShape(editor.getJSON())).toEqual([]);
      });
    }

    it("colar uma lista dentro de um item no limite é recusado", () => {
      const editor = makeEditor(atLimit("b"));
      const before = editor.getJSON();
      let pos = -1;
      editor.state.doc.descendants((node, p) => {
        if (node.isText && node.text === "b") pos = p + 1;
      });
      editor.commands.insertContentAt(pos, "<ul><li><p>fundo</p></li></ul>");
      expect(editor.getJSON()).toEqual(before);
    });

    it("digitar no limite continua funcionando", () => {
      const editor = makeEditor(atLimit("b"));
      typeAtEnd(editor, "b", "c");
      editor.commands.insertContent("d");
      expect(JSON.stringify(editor.getJSON())).toContain("bd");
    });

    it("carregar um documento mais fundo que o limite (setContent) não é bloqueado", () => {
      const deep: JSONContent = { type: "doc", content: [ill(ul(li("a", ul(li("b", ul(li("c")))))))] };
      const editor = makeEditor();
      editor.commands.setContent(deep);
      expect(maxTextDepth(editor.getJSON())).toBe(10);
      expect(maxTextDepth(makeEditor(deep).getJSON())).toBe(10);
    });
  });

  it("colar ou inserir a cópia de um Ponto termina com ids únicos", () => {
    const editor = makeEditor(EXAMPLE_DOC);
    editor.commands.insertContentAt(editor.state.doc.content.size, '<div data-type="point" data-id="pt1">Cópia</div>');
    const copy = { type: "point", attrs: { id: "pt2" }, content: [{ type: "text", text: "Outra" }] };
    editor.commands.insertContentAt(editor.state.doc.content.size, copy);
    editor.commands.insertContentAt(editor.state.doc.content.size, copy);
    const ids = top(editor)
      .filter((n) => n.type === "point")
      .map((n) => n.attrs!.id);
    expect(ids).toHaveLength(5);
    expect(ids.slice(0, 2)).toEqual(["pt1", "pt2"]);
    expect(new Set(ids).size).toBe(5);
    expect(allowedShape(editor.getJSON())).toEqual([]);
  });

  it("id longo demais, vazio ou que não é texto é trocado", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        { type: "point", attrs: { id: "x".repeat(37) }, content: [{ type: "text", text: "Um" }] },
        { type: "heading", attrs: { id: "", level: 2 }, content: [{ type: "text", text: "Dois" }] },
        { type: "illustration", attrs: { id: 42 }, content: [{ type: "paragraph" }] },
      ],
    });
    editor.commands.insertContentAt(editor.state.doc.content.size, { type: "paragraph" });
    for (const n of top(editor).slice(0, 3)) {
      expect(typeof n.attrs!.id).toBe("string");
      expect(n.attrs!.id.length).toBeGreaterThan(0);
      expect(n.attrs!.id.length).toBeLessThanOrEqual(36);
    }
    expect(allowedShape(editor.getJSON())).toEqual([]);
  });

  it("Versículo colado com data-verse inválido não vira nó", () => {
    const bad = JSON.stringify({ reference: "João 3:16", verses: "não é lista" }).replace(/"/g, "&quot;");
    const good = JSON.stringify({
      reference: " " + "R".repeat(130),
      book: 99,
      chapter: 3,
      verseStart: 0,
      verseEnd: 16.5,
      translation: "",
      verses: [{ number: -1, text: "texto" }],
    }).replace(/"/g, "&quot;");
    const editor = makeEditor();
    expect(() =>
      editor.commands.setContent(
        `<div data-type="verse" data-verse="${bad}"><blockquote>x</blockquote></div><div data-type="verse" data-verse="{oops"></div><div data-type="verse" data-verse="${good}"></div>`,
      ),
    ).not.toThrow();
    const verses = top(editor).filter((n) => n.type === "verse");
    expect(verses).toHaveLength(1);
    expect(verses[0].attrs).toMatchObject({
      reference: "R".repeat(120),
      book: null,
      chapter: 3,
      verseStart: null,
      verseEnd: null,
      translation: null,
      verses: [{ number: null, text: "texto" }],
    });
    expect(allowedShape(editor.getJSON())).toEqual([]);
  });

  describe("cursor depois de inserir um bloco", () => {
    // Documento do caso observado: [Versículo, Ponto, Só para mim], cursor no fim do Ponto.
    function observed() {
      const editor = makeEditor({
        type: "doc",
        content: [
          EXAMPLE_DOC.content[0],
          { type: "point", attrs: { id: "pt1" }, content: [{ type: "text", text: "A luz chama" }] },
          { type: "privateNote", attrs: { id: "n1" }, content: [{ type: "paragraph", content: [{ type: "text", text: "nota" }] }] },
        ],
      });
      let end = 0;
      editor.state.doc.forEach((node, offset) => {
        if (node.type.name === "point") end = offset + node.nodeSize - 1;
      });
      editor.commands.setTextSelection(end);
      return editor;
    }
    const where = (editor: Editor) => ({
      parent: editor.state.selection.$from.parent.type.name,
      block: editor.state.selection.$from.node(1).type.name,
      index: editor.state.selection.$from.index(0),
    });

    for (const kind of ["illustration", "application", "privateNote"] as const) {
      it(`insertCallout('${kind}') deixa o cursor no parágrafo do bloco novo`, () => {
        const editor = observed();
        editor.commands.insertCallout(kind);
        expect(where(editor)).toEqual({ parent: "paragraph", block: kind, index: 2 });
        editor.commands.insertContent("x");
        expect(top(editor)[2]).toMatchObject({ type: kind, content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }] });
        expect(top(editor)[1].content).toEqual([{ type: "text", text: "A luz chama" }]);
      });
    }

    it("insertPoint dentro de um bloco deixa o cursor no Ponto novo", () => {
      const editor = observed();
      editor.commands.setTextSelection(editor.state.doc.content.size - 2);
      editor.commands.insertPoint();
      expect(where(editor)).toEqual({ parent: "point", block: "point", index: 3 });
      editor.commands.insertContent("x");
      expect(top(editor)[3]).toMatchObject({ type: "point", content: [{ type: "text", text: "x" }] });
    });

    it("insertVerse deixa o cursor no bloco depois do Versículo (cria parágrafo se for o último)", () => {
      const editor = observed();
      editor.commands.setTextSelection(editor.state.doc.content.size - 2);
      editor.commands.insertVerse(MANUAL_VERSE);
      expect(top(editor).map((n) => n.type)).toEqual(["verse", "point", "privateNote", "verse", "paragraph"]);
      expect(where(editor)).toEqual({ parent: "paragraph", block: "paragraph", index: 4 });
      editor.commands.insertContent("x");
      expect(top(editor)[4]).toEqual({ type: "paragraph", content: [{ type: "text", text: "x" }] });

      const middle = observed();
      middle.commands.insertVerse(MANUAL_VERSE);
      // (o parágrafo final, se houver, é o trailingNode do StarterKit)
      expect(top(middle).map((n) => n.type).slice(0, 4)).toEqual(["verse", "point", "verse", "privateNote"]);
      expect(where(middle)).toMatchObject({ block: "privateNote", index: 3 });
    });
  });

  describe("Enter em Ponto e título", () => {
    const blocks: [string, JSONContent][] = [
      ["Ponto", { type: "point", attrs: { id: "p" }, content: [{ type: "text", text: "Abcd" }] }],
      ["título", { type: "heading", attrs: { id: "h", level: 2 }, content: [{ type: "text", text: "Abcd" }] }],
    ];
    for (const [label, node] of blocks) {
      const enterAt = (offset: number) => {
        const editor = makeEditor({ type: "doc", content: [node, { type: "paragraph", content: [{ type: "text", text: "depois" }] }] });
        editor.commands.setTextSelection(1 + offset);
        // Como o navegador: keydown direto na view (o comando keyboardShortcut só repassa os passos, não a seleção).
        const handled = editor.view.someProp("handleKeyDown", (f) =>
          f(editor.view, new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })),
        );
        expect(handled).toBe(true);
        return editor;
      };

      it(`no fim do ${label}: parágrafo vazio abaixo, com o cursor`, () => {
        const editor = enterAt(4);
        expect(top(editor).map((n) => n.type)).toEqual([node.type, "paragraph", "paragraph"]);
        expect(top(editor)[0].content).toEqual([{ type: "text", text: "Abcd" }]);
        expect(top(editor)[1]).toEqual({ type: "paragraph" });
        expect(editor.state.selection.$from.index(0)).toBe(1);
        editor.commands.insertContent("x");
        expect(top(editor)[1]).toEqual({ type: "paragraph", content: [{ type: "text", text: "x" }] });
      });

      it(`no começo do ${label}: parágrafo vazio acima, cursor fica no ${label}`, () => {
        const editor = enterAt(0);
        expect(top(editor).map((n) => n.type)).toEqual(["paragraph", node.type, "paragraph"]);
        expect(top(editor)[0]).toEqual({ type: "paragraph" });
        expect(editor.state.selection.$from.parent.type.name).toBe(node.type);
        expect(editor.state.selection.$from.parentOffset).toBe(0);
        expect(top(editor)[1].attrs!.id).toBe(node.attrs!.id);
      });

      it(`no meio do ${label}: divide`, () => {
        const editor = enterAt(2);
        const json = top(editor);
        expect(json[0].content).toEqual([{ type: "text", text: "Ab" }]);
        expect(json[1].content).toEqual([{ type: "text", text: "cd" }]);
        expect(json[0].attrs!.id).not.toBe(json[1].attrs!.id);
        expect(allowedShape(editor.getJSON())).toEqual([]);
      });
    }
  });

  it("sem foco, a seleção não fica num Versículo inteiro (documento começando por Versículo)", async () => {
    const editor = makeEditor(EXAMPLE_DOC);
    await new Promise((resolve) => setTimeout(resolve, 0)); // o Tiptap emite "create" num setTimeout
    // Selection.atStart daria a seleção de nó do Versículo; o editor troca pelo começo do primeiro texto.
    expect(editor.state.selection.constructor.name).toBe("TextSelection");
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
    editor.commands.setNodeSelection(0);
    expect(editor.state.selection.constructor.name).toBe("NodeSelection");
    editor.view.dom.dispatchEvent(new FocusEvent("blur"));
    expect(editor.state.selection.constructor.name).toBe("TextSelection");
  });
});
