import JSZip from 'jszip';
import { describe, expect, it } from "vitest";
import { buildPptx } from "./slides-pptx";
import type { DeckSlide } from "./slides-deck";

const slide = (text: string, reference: string | null): DeckSlide => ({
  background: "#05070B",
  text,
  textColor: "#F5F6FA",
  bold: false,
  fontSize: 44,
  reference,
  referenceColor: "#A5ABBB",
});

describe("buildPptx (pptxgenjs de verdade)", () => {
  it("gera um zip não vazio (PK) com 3 slides", async () => {
    const data = await buildPptx("Luz", [
      slide("Um", "João 1:1"),
      slide("Dois", null),
      slide("Três", "João 1:3"),
    ]);
    const bytes = new Uint8Array(data);
    expect(bytes.length).toBeGreaterThan(1000);
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text).toContain("ppt/slides/slide3.xml");
    expect(text).not.toContain("ppt/slides/slide4.xml");
  }, 20000);

  it('propriedades do arquivo: autor e empresa ChurchManager, assunto = título', async () => {
    const zip = await JSZip.loadAsync(await buildPptx('Luz do mundo', [slide('Um', null)]));
    const core = await zip.file('docProps/core.xml')!.async('string');
    const app = await zip.file('docProps/app.xml')!.async('string');
    expect(core).toContain('ChurchManager');
    expect(core).toContain('Luz do mundo');
    expect(core).not.toMatch(/<dc:creator>PptxGenJS/);
    expect(app).toContain('<Company>ChurchManager</Company>');
    expect(app).not.toMatch(/<Company>PptxGenJS/);
  }, 20000);
});
