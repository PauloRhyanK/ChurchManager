import { PART_KINDS, PART_KIND_LABEL, type DerivedPart, type PartKind } from "./document";
import { plain } from "./format";

export interface PartChoice {
  kind: PartKind;
  /** null: o nome sai do tipo ("Refrão", "Verso 2"). */
  name: string | null;
}

export interface PartOption {
  label: string;
  choice: PartChoice;
}

/** Nome que o próprio tipo daria (sem nome escrito à mão). */
const isTypeName = (part: DerivedPart) =>
  part.kind === "VERSE" ? /^Verso \d+$/.test(part.name) : part.name === PART_KIND_LABEL[part.kind];

/**
 * Sugestões para renomear uma parte: os nomes que já existem na música e os
 * tipos padrão que ainda não aparecem nela.
 */
export function partNameOptions(parts: DerivedPart[]): { existing: PartOption[]; types: PartOption[] } {
  const existing: PartOption[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const key = plain(part.name);
    if (seen.has(key)) continue;
    seen.add(key);
    // "Verso 2" escolhido para outra parte vira nome dela: a numeração dos versos não sabe que é repetição.
    const name = isTypeName(part) && part.kind !== "VERSE" ? null : part.name;
    existing.push({ label: part.name, choice: { kind: part.kind, name } });
  }
  const types = PART_KINDS.filter((kind) => !seen.has(plain(PART_KIND_LABEL[kind]))).map((kind) => ({
    label: PART_KIND_LABEL[kind],
    choice: { kind, name: null },
  }));
  return { existing, types };
}

/**
 * O que vale um nome digitado: um nome que já existe ou um tipo padrão; senão,
 * nome novo, com o tipo tirado do começo ("Refrão final" é Refrão) ou mantido.
 */
export function choiceFromText(text: string, parts: DerivedPart[], currentKind: PartKind): PartChoice | null {
  const name = text.replace(/\s+/g, " ").trim();
  if (!name) return null;
  const key = plain(name);
  const { existing } = partNameOptions(parts);
  const known = existing.find((o) => plain(o.label) === key);
  if (known) return known.choice;
  const exact = PART_KINDS.find((kind) => plain(PART_KIND_LABEL[kind]) === key);
  if (exact) return { kind: exact, name: null };
  const prefixed = [...PART_KINDS]
    .sort((a, b) => PART_KIND_LABEL[b].length - PART_KIND_LABEL[a].length)
    .find((kind) => key.startsWith(plain(PART_KIND_LABEL[kind])));
  return { kind: prefixed ?? currentKind, name };
}
