import { describe, expect, it } from "vitest";
import api from "../../../../../api/src/modules/sermons/sermon-slides.ts?raw";
import admin from "./slides.ts?raw";
import { AGENDA_DOC, AGENDA_TITLE, AGENDA_TOPICS } from "./sermon-example";
import { buildSlides, countSlides, editableTextFits, publicSlides, readSlideMode, slideFace, type SlideItem } from "./slides";

// O gerador é cópia da API; o teste completo do exemplo fica em apps/api/src/modules/sermons/sermon-slides.spec.ts.

describe("slides.ts é cópia da API", () => {
  it("igual a sermon-slides.ts, fora o cabeçalho e o caminho do tipo do documento", () => {
    const body = admin.slice(admin.indexOf("// Slides da Palavra")).replace("from './document'", "from './sermon-document'");
    expect(body).toBe(api);
  });
});

describe("buildSlides e countSlides (o exemplo aprovado)", () => {
  it("13 slides em \"Com versículos\" e 9 em \"Só títulos\"", () => {
    expect(countSlides(AGENDA_TITLE, AGENDA_DOC)).toEqual({ VERSES_AND_POINTS: 13, TITLES: 9 });
  });

  it("capa com o versículo de abertura, visão geral numerada e o slide de cada ponto com \"n. Título\"", () => {
    const s = buildSlides(AGENDA_TITLE, AGENDA_DOC, "VERSES_AND_POINTS");
    expect(s[0]).toMatchObject({ id: "is46:0", kind: "VERSE", layout: "VERSE", heading: AGENDA_TITLE, reference: "Isaías 46:10" });
    expect(s[1]).toMatchObject({ id: "overview", kind: "SUMMARY", layout: "NUMBERED", items: AGENDA_TOPICS, start: 1 });
    expect(s[2]).toMatchObject({ kind: "VERSE", heading: `1. ${AGENDA_TOPICS[0]}` });
    // Sem a função da API, as referências dos itens ficam como foram escritas.
    expect(s[11]).toMatchObject({ kind: "SUMMARY", layout: "BULLETS" });
    expect(s[11].items?.[0]).toContain("(Gn 37:5)");
  });

  it("\"Só títulos\": capa só com o título, visão geral e um POINT por ponto", () => {
    const s = buildSlides(AGENDA_TITLE, AGENDA_DOC, "TITLES");
    expect(s.map((x) => x.kind)).toEqual(["TITLE", "SUMMARY", ...AGENDA_TOPICS.map(() => "POINT")]);
    expect(s[4]).toMatchObject({ id: "p3:title", text: `3. ${AGENDA_TOPICS[2]}`, layout: "TITLE" });
  });
});

describe("face, envio e limites", () => {
  const verse: SlideItem = {
    id: "v:0", kind: "VERSE", sourceBlockId: "v", text: "Eu sou a luz do mundo.", reference: "João 8:12", included: true, edited: false,
    layout: "VERSE", heading: "1. A luz", items: null, start: null, version: "BLIVRE",
  };

  it("slideFace do versículo: o título é o heading; publicSlides tira desmarcados e privados", () => {
    expect(slideFace(verse)).toEqual({ layout: "VERSE", title: "1. A luz", verse: "Eu sou a luz do mundo.", reference: "João 8:12", items: null, start: null });
    const privateNote: SlideItem = { ...verse, id: "n:0", kind: "PRIVATE", text: "Só eu", reference: null, layout: "TITLE", heading: null, included: true };
    expect(publicSlides([verse, { ...verse, id: "v:1", included: false }, privateNote]).map((p) => p.kind)).toEqual(["VERSE"]);
  });

  it("modos antigos valem como \"Com versículos\"; o título editável vai até 120", () => {
    expect(readSlideMode("FULL")).toBe("VERSES_AND_POINTS");
    expect(readSlideMode("VERSES")).toBe("VERSES_AND_POINTS");
    expect(readSlideMode("TITLES")).toBe("TITLES");
    expect(editableTextFits("a".repeat(120))).toBe(true);
    expect(editableTextFits("a".repeat(121))).toBe(false);
  });
});
