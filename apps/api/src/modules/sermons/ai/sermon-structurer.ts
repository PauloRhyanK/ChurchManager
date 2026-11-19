// Interface neutra de provedor para "Colar texto": a IA só diz onde começa e termina cada parte do texto colado.
// O texto em si sai das linhas coladas, no servidor; a IA nunca reescreve o que o pregador escreveu.

export type OutlineKind = 'HEADING' | 'PARAGRAPH' | 'POINT' | 'VERSE' | 'ILLUSTRATION' | 'APPLICATION' | 'LIST';
export const OUTLINE_KINDS: readonly OutlineKind[] = ['HEADING', 'PARAGRAPH', 'POINT', 'VERSE', 'ILLUSTRATION', 'APPLICATION', 'LIST'];

/**
 * Uma parte do esboço: as linhas `start`–`end` (numeradas a partir de 1) do texto colado.
 * `text` é o título limpo do Ponto ou do subtítulo (vazio nos outros); `reference` é a referência do versículo.
 */
export type OutlineBlock = { kind: OutlineKind; start: number; end: number; text: string; reference: string };

export type StructureInput = { lines: string[]; model: string; effort: 'low' | 'medium' | 'high' };
export type StructureOutput = { title: string; blocks: OutlineBlock[] };

export interface SermonStructurer {
  structure(input: StructureInput): Promise<StructureOutput>;
}

/** Token de injeção: Record<'anthropic', SermonStructurer>. */
export const STRUCTURERS = Symbol('STRUCTURERS');
