# Palavras, etapa 2: Bíblia e busca de versículos — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O pregador insere um versículo procurando por referência abreviada ("mt 5 14") ou por um trecho, com intervalo e tradução, a partir de uma Bíblia de uso livre guardada no banco.

**Architecture:** Duas tabelas globais (sem tenant): traduções e versículos. Um script lê o arquivo VPL do eBible.org e grava a tradução. A busca é uma função pura que reconhece a referência (`parseReference`) mais um serviço atrás da interface `BibleSource`; as rotas ficam no módulo `sermons`. No painel, o diálogo "Inserir versículo" ganha a busca e mantém o modo de digitar à mão.

**Tech Stack:** NestJS + Prisma + `node:test`; React 18 + TanStack Query + shadcn/ui + vitest. Nenhuma dependência nova.

**Spec:** `docs/superpowers/specs/2026-11-19-palavras-pregador-design.md`, seção "Bíblia". Decisão do usuário: Bíblia Livre (BLIVRE), CC BY 4.0, aprovada.

## Global Constraints

- Gates do `AGENTS.md` com exit 0 (API e admin). A API não tem ESLint.
- As tabelas da Bíblia são globais: sem `tenantId`. As rotas exigem `SERMONS:VIEW` e não devolvem nada de tenant.
- **O arquivo da Bíblia não vai para o Git** (nem inteiro, nem em parte maior que um punhado de versículos de teste). O script recebe o caminho.
- Nenhuma dependência nova. Sem extensão do Postgres (`unaccent`, `pg_trgm`): a busca por trecho usa `LIKE` em `searchText`.
- O texto do versículo é copiado para dentro do bloco `verse` do documento, no formato que o validador da etapa 1 já aceita (`sermon-document.ts`): `{ reference, book, chapter, verseStart, verseEnd, translation, verses: [{ number, text }] }`. Nada muda no validador.
- Textos em pt-BR. Nenhum texto diz "IA". Corpo de escrita montado campo a campo. DTO com whitelist.
- Não tocar em `apps/ponte`. Não fazer push; commits só na branch atual.
- Formato VPL conferido no arquivo real (`porbr2018_vpl.txt`, 31.102 linhas, 66 livros, 1.189 capítulos): uma linha por versículo, `COD C:V texto`, com o código de três caracteres do eBible (lista na Tarefa 1) e marcadores de acróstico no começo do texto de alguns versículos de Salmos e Lamentações (`[Nun] :Tua palavra…`), que são removidos.
- SHA-256 conferidos em 19/11/2026: `porbr2018_vpl.zip` = `3d9c4c8a36d33e16f92258f86ca3eef8c4df230055ec8fb9268594f9100fcda0`; `porbr2018_vpl.txt` = `20f7cccf95e99d0b07d3a483aeebe9a0dcad0c8b52cb169cf917c9e684a4d858`.

## Review Focus

1. Referência com livro numerado e sem espaço (`1co13 4-7`, `1 co 13:4-7`, `i co 13.4`, `1ª coríntios 13`) e com acento ou sem (`joao 3 16`, `João 3:16`) → mesma referência (Tarefa 1).
2. Texto que parece referência mas não é (`amor 13`, `luz do mundo`) → cai na busca por trecho, não em erro (Tarefas 1 e 3).
3. Capítulo ou versículo que não existe (`mt 99`, `jo 3 999`), intervalo invertido (`mt 5 16-14`) e intervalo que passa do fim do capítulo → resposta vazia ou cortada no fim do capítulo, nunca erro 500 (Tarefa 3).
4. Trecho com `%`, `_` ou aspas → tratado como texto literal, sem alterar o `LIKE` (Tarefa 3).
5. Importar duas vezes, ou importar um arquivo incompleto → a segunda substitui a tradução inteira numa transação; arquivo sem os 66 livros falha sem deixar a tradução pela metade (Tarefa 2).

---

### Task 1: Livros da Bíblia e leitura de referência

**Files:**
- Create: `apps/api/src/modules/sermons/bible/bible-books.ts`
- Create: `apps/api/src/modules/sermons/bible/bible-reference.ts`
- Test: `apps/api/src/modules/sermons/bible/bible-reference.spec.ts`

**Interfaces — Produces:**

```ts
// bible-books.ts
export type BibleBook = { number: number; name: string; vpl: string; chapters: number; aliases: string[] };
export const BIBLE_BOOKS: BibleBook[];              // 66 livros, ordem protestante, number 1..66
export function bookByNumber(n: number): BibleBook | undefined;
export function bookByVplCode(code: string): BibleBook | undefined;

// bible-reference.ts
export type ParsedReference = { book: number; chapter: number; verseStart: number | null; verseEnd: number | null };
export function normalizeBibleText(text: string): string;   // NFD sem diacríticos, minúsculas, espaços colapsados
export function parseReference(text: string): ParsedReference | null;
export function formatReference(ref: { book: number; chapter: number; verseStart: number | null; verseEnd: number | null }): string;
```

Decisões:
- `name` em pt-BR como a igreja fala ("Gênesis", "Salmos", "Cantares", "1 Coríntios", "Apocalipse"). `chapters` é a contagem de capítulos do cânon (Gênesis 50 … Apocalipse 22; a soma dá 1.189).
- `vpl`, na ordem: `GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SOL ISA JER LAM EZE DAN HOS JOE AMO OBA JON MIC NAH HAB ZEP HAG ZEC MAL MAT MAR LUK JOH ACT ROM 1CO 2CO GAL EPH PHI COL 1TH 2TH 1TI 2TI TIT PHM HEB JAM 1PE 2PE 1JO 2JO 3JO JUD REV`.
- `aliases` já normalizados (sem acento, minúsculas, sem espaço e sem ponto), incluindo o nome inteiro e as abreviações usuais em pt-BR: `gn`, `ex`, `lv`, `nm`, `dt`, `js`, `jz`, `rt`, `1sm`, `2sm`, `1rs`, `2rs`, `1cr`, `2cr`, `ed`, `ne`, `et`, `jo` (Jó é `jó`→`jo`: ver abaixo), `sl`, `pv`, `ec`, `ct`, `is`, `jr`, `lm`, `ez`, `dn`, `os`, `jl`, `am`, `ob`, `jn`, `mq`, `na`, `hc`, `sf`, `ag`, `zc`, `ml`, `mt`, `mc`, `lc`, `jo`, `at`, `rm`, `1co`, `2co`, `gl`, `ef`, `fp`, `cl`, `1ts`, `2ts`, `1tm`, `2tm`, `tt`, `fm`, `hb`, `tg`, `1pe`, `2pe`, `1jo`, `2jo`, `3jo`, `jd`, `ap`, mais variantes comuns (`sal`, `salmo`, `salmos`, `mat`, `joao`, `rom`, `apoc`, `gen`, `exo`, `heb`, `tiago`, `atos`…).
- **Colisão `jo`:** sem acento, "Jó" e "Jo" (João) ficam iguais. `jo` é **João**; Jó é reconhecido por `job` e pelo texto digitado **com** acento (`jó`), que `parseReference` confere antes de normalizar.
- Gramática de `parseReference`: `[numeral] nome  capítulo [separador versículo [- versículoFim]]`. Numeral do livro: `1`, `2`, `3`, `I`, `II`, `III`, com `ª`/`º`/`a`/`o` opcional, colado ou separado do nome. Separador entre capítulo e versículo: espaço, `:`, `.` ou `,`. Intervalo com `-` ou `–`, com ou sem espaços. Só capítulo → `verseStart: null`. Devolve `null` quando o nome não é um livro, quando sobra texto depois, quando o capítulo é 0 ou maior que `chapters` do livro, quando o versículo é 0, ou quando o fim é menor que o começo. Não confere se o versículo existe (isso é do banco).
- `formatReference` → `"Mateus 5:14"`, `"Mateus 5:14-16"`, `"Salmos 23"`; começo igual ao fim → sem intervalo.

- [ ] Testes: `mt 5 14`, `mt 5:14`, `Mateus 5.14`, `MT 5,14` → `{book:40,chapter:5,verseStart:14,verseEnd:14}`; `1co 13 4-7`, `1 co 13:4-7`, `1co13 4-7`, `i co 13 4 – 7`, `1ª coríntios 13:4-7` → `{46,13,4,7}`; `sl 23` → `{19,23,null,null}`; `joao 3 16` e `João 3:16` → livro 43; `jo 3 16` → 43; `jó 3 16` e `job 3 16` → 18; `3jo 1 4` → 64; `ap 22 21` → 66; `amor 13`, `luz do mundo`, `mt`, `mt 5 14 abc`, `mt 0`, `mt 29`, `mt 5 0`, `mt 5 16-14`, `""` → `null`; `formatReference` nos três formatos; `BIBLE_BOOKS` tem 66 livros, números 1..66 em ordem, soma dos capítulos 1.189, códigos `vpl` únicos, e nenhum alias repetido entre livros (fora o caso `jo` documentado).
- [ ] Ver falhar, implementar, ver passar; `npx tsc --noEmit -p tsconfig.json`. Commit `feat(palavras): livros da Bíblia e leitura de referência`.

### Task 2: Tabelas, leitura do VPL e script de importação

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20261121120000_add_bible/migration.sql`
- Create: `apps/api/src/modules/sermons/bible/bible-vpl.ts`, `bible-import.ts`
- Create: `apps/api/scripts/import-bible.ts`
- Modify: `apps/api/package.json` (script `script:import-bible`, no padrão dos outros `script:*`)
- Create: `apps/api/src/modules/sermons/bible/README.md`
- Test: `apps/api/src/modules/sermons/bible/bible-vpl.spec.ts`, `bible-import.spec.ts`

**Interfaces — Consumes:** `BIBLE_BOOKS`, `bookByVplCode`, `normalizeBibleText` (Tarefa 1). **Produces:**

```ts
// bible-vpl.ts
export type VplVerse = { book: number; chapter: number; verse: number; text: string };
export function parseVpl(content: string): VplVerse[];            // lança Error com o número da linha em linha malformada ou código desconhecido
export function assertCanon(verses: VplVerse[]): void;           // lança Error se faltar livro ou a contagem de capítulos de algum livro não bater

// bible-import.ts
export type TranslationMeta = { code: string; name: string; shortName: string; license: string; attribution: string; sourceUrl: string; sourceVersion: string; isDefault: boolean };
export const BIBLE_PRESETS: Record<string, TranslationMeta>;      // só BLIVRE
export function importBible(prisma: PrismaClient, meta: TranslationMeta, verses: VplVerse[]): Promise<{ verses: number }>;
```

Schema (sem `tenantId`):
- `BibleTranslation` → `bible_translations`: `id` uuid, `code` VarChar(16) **@unique**, `name` VarChar(120), `shortName` VarChar(32), `license` VarChar(255), `attribution` Text, `sourceUrl` VarChar(512), `sourceVersion` VarChar(32), `isDefault` Boolean default false, `createdAt`, `updatedAt`.
- `BibleVerse` → `bible_verses`: `translationId` (Cascade), `book` SmallInt, `chapter` SmallInt, `verse` SmallInt, `text` Text, `searchText` Text. Chave primária composta `(translationId, book, chapter, verse)`; sem `id`.

Decisões:
- `parseVpl`: linhas em branco são ignoradas; BOM e `\r\n` aceitos; cada linha `^(\S{3}) (\d+):(\d+) (.*)$`; o marcador de acróstico no começo do texto (`^\[[^\]]+\]\s*:\s*`) é removido; texto aparado; versículo com texto vazio depois disso é erro. Versículo repetido é erro.
- `importBible`: uma transação (tempo limite de 120 s): `upsert` da tradução por `code`, `deleteMany` dos versículos dela, `createMany` em lotes de 2.000, com `searchText = normalizeBibleText(text)`. Se `meta.isDefault`, desmarca as outras traduções. Chama `assertCanon` antes de abrir a transação.
- `BIBLE_PRESETS.BLIVRE`: `name: 'Bíblia Livre'`, `shortName: 'Bíblia Livre'`, `license: 'Creative Commons Atribuição 4.0 Brasil'`, `attribution: 'Bíblia Livre (BLIVRE), Copyright © Diego Santos, Mario Sérgio, e Marco Teles, http://sites.google.com/site/biblialivre/ - fevereiro de 2018. Licença Creative Commons Atribuição 4.0 Brasil (http://creativecommons.org/licenses/by/4.0/br/).'`, `sourceUrl: 'https://ebible.org/details.php?id=porbr2018'`, `sourceVersion: 'fevereiro de 2018'`, `isDefault: true`.
- Script: `npm run script:import-bible -- --file <caminho do .txt> --code BLIVRE`. `--code` tem de existir em `BIBLE_PRESETS` (senão erro explicando). Imprime "BLIVRE: 31102 versículos importados." e sai com código 1 em qualquer erro.
- `README.md` da pasta: de onde baixar (`https://ebible.org/Scriptures/porbr2018_vpl.zip`), os dois SHA-256 das restrições globais, o comando, que roda uma vez por ambiente (local, QA, produção), que o arquivo não vai para o Git, o crédito exigido pela licença, e que os marcadores de acróstico do arquivo de origem são removidos na importação.

- [ ] Testes de `parseVpl`: três linhas válidas (uma com `[Nun] :`) → objetos esperados com o marcador removido; `\r\n` e BOM; código desconhecido (`XXX 1:1 a`) e linha sem referência → erro citando a linha; versículo repetido → erro. `assertCanon` com um conjunto mínimo gerado no teste (um versículo por capítulo de cada livro, a partir de `BIBLE_BOOKS`) passa; tirando um livro ou um capítulo, falha citando o livro.
- [ ] Testes de `importBible` com Prisma falso: grava a tradução e os versículos com `searchText` sem acento; importar de novo apaga os anteriores antes de gravar; conjunto incompleto → erro antes de qualquer escrita.
- [ ] Migração escrita à mão e conferida com `prisma migrate diff` (sem diferença), num Postgres descartável próprio.
- [ ] **Com o arquivo real** (caminho informado pelo controlador; não copiar para dentro do repositório): rodar o script no Postgres descartável e conferir `SELECT count(*)` = 31102, 66 livros, `João 8:12` e `Salmos 119:105` (este sem `[Nun]`), e rodar de novo para confirmar que substitui sem duplicar.
- [ ] `npx prisma generate && npx tsc --noEmit -p tsconfig.json && npm test && npm run build`. Commit `feat(palavras): tabelas da Bíblia e importação do VPL`.

### Task 3: Busca na Bíblia (serviço e rotas)

**Files:**
- Create: `apps/api/src/modules/sermons/bible/bible.service.ts`, `bible.controller.ts`, `dto/bible.dto.ts` (dentro de `bible/`)
- Modify: `apps/api/src/modules/sermons/sermons.module.ts`
- Test: `apps/api/src/modules/sermons/bible/bible.service.spec.ts`

**Interfaces — Consumes:** `parseReference`, `formatReference`, `normalizeBibleText`, `bookByNumber`. **Produces:**

```ts
export interface BibleSource {
  translations(): Promise<{ code: string; name: string; shortName: string; attribution: string; license: string; isDefault: boolean }[]>;
  lookup(translation: string, book: number, chapter: number, start: number | null, end: number | null): Promise<{ number: number; text: string }[]>;
  searchText(translation: string, words: string[], limit: number): Promise<{ book: number; chapter: number; verse: number; text: string }[]>;
}
export type BibleHit = {
  reference: string; book: number; chapter: number; verseStart: number; verseEnd: number;
  translation: string; verses: { number: number; text: string }[];
  hint: string | null;                    // "Três versículos · do 14 ao 16", "Capítulo inteiro · 6 versículos"
};
export type BibleSearchResult = { mode: 'REFERENCE' | 'TEXT' | 'NONE'; hits: BibleHit[] };
class BibleService { translations(); search(q: string, translation?: string): Promise<BibleSearchResult> }
```

Rotas em `admin/tenants/me/sermons/bible` (`AuthGuard('jwt')` + `PermissionsGuard`, `SERMONS:VIEW`, mesmo `SkipThrottle` do `SermonsController`): `GET /translations`; `GET /search?q=&translation=` com `@Throttle({ public: { limit: 120, ttl: 60_000 } })`. `q`: texto de 1 a 120 caracteres; `translation`: opcional, até 16.

Decisões:
- Tradução: a pedida, se existir; senão a `isDefault`; senão a primeira. Sem nenhuma tradução importada → `{ mode: 'NONE', hits: [] }`.
- `q` aparado. Se `parseReference(q)` devolve referência → modo `REFERENCE`:
  - capítulo inteiro: um hit com os versículos do capítulo (no máximo 200), `hint: 'Capítulo inteiro · N versículos'`;
  - intervalo: um hit, cortado no último versículo que existe; `hint: null`;
  - um versículo: até três hits, nesta ordem — o versículo; o intervalo dele até dois adiante, se existir pelo menos um adiante (`hint: 'Dois versículos · do 14 ao 15'` ou `'Três versículos · do 14 ao 16'`); o versículo seguinte, se existir;
  - nada encontrado no banco → `{ mode: 'NONE', hits: [] }`.
- Senão, modo `TEXT`: `normalizeBibleText(q)` partido em palavras; menos de 3 caracteres no total → `NONE`. Todas as palavras têm de aparecer (`searchText LIKE %palavra%` para cada uma, com `%`, `_` e `\` escapados), ordem por livro, capítulo, versículo, limite 20. Cada resultado é um hit de um versículo. Sem resultado → `{ mode: 'TEXT', hits: [] }`.
- `reference` de cada hit vem de `formatReference`. `translation` é o `code`.
- A implementação de `BibleSource` sobre o Prisma fica no mesmo arquivo do serviço (`PrismaBibleSource`), injetada por token (`BIBLE_SOURCE`), para a troca prevista na spec.

- [ ] Testes com um `BibleSource` em memória (Mateus 5:13-16, João 3:16-17, Salmos 23 inteiro com 6 versículos, João 8:12): `mt 5 14` → três hits (14; 14-16 com o hint de três; 15); `mt 5 15` com só o 16 adiante → hint de dois; último versículo do capítulo → um hit; `sl 23` → um hit com 6 versículos e o hint; `mt 5 14-99` → cortado em 16; `mt 99` e `jo 3 999` → `NONE`; `luz do mundo` → `TEXT` com Mateus 5:14 e João 8:12 na ordem dos livros; `Luz  MUNDO` igual; `ab` → `NONE`; trecho com `%` e `_` chega escapado ao `searchText` do source (teste do `PrismaBibleSource` com Prisma falso conferindo o `where`); tradução desconhecida cai na padrão; sem traduções → `NONE`; DTO recusa `q` vazio e de 121 caracteres.
- [ ] Ver falhar, implementar, ver passar; `npx tsc --noEmit -p tsconfig.json && npm test && npm run build`. Commit `feat(palavras): busca na Bíblia por referência e por trecho`.

### Task 4: Painel: inserir versículo pela busca

**Files:**
- Modify: `apps/admin/src/features/sermons/api/sermons-api.ts` (`listBibleTranslations`, `searchBible`, tipos `BibleHit`, `BibleSearchResult`, `BibleTranslation`)
- Modify: `apps/admin/src/features/sermons/editor/VerseDialog.tsx`, `editor/blocks/VerseView.tsx`, e quem chama o diálogo (`SermonToolbar.tsx`)
- Test: `apps/admin/src/features/sermons/editor/VerseDialog.test.tsx`

**Interfaces:** `VerseDialog` passa a entregar o bloco pronto: `onSubmit(attrs: Omit<VerseAttrs, 'id'>)`. `manualVerseAttrs` continua exportada.

Decisões (desenho `PalavraVersiculo`):
- O diálogo tem dois modos. **Buscar** (padrão quando há tradução importada): campo único no topo com o ícone de livro, `aria-label="Referência ou palavras do versículo"`, `placeholder="João 3:16 ou um trecho"`, foco ao abrir; busca 250 ms depois da última tecla, a partir de 2 caracteres; resultados em lista (`role="listbox"`), cada um com a referência em roxo e negrito e, abaixo, o texto (um versículo) ou o `hint` (intervalo e capítulo inteiro); o primeiro vem destacado; setas ↑ ↓ mudam o destaque; **Enter insere** o destacado; clicar insere. Rodapé: seletor de tradução (`shortName`; some quando só há uma, mostrando o nome como texto), o crédito `"<shortName> · <license>"` e "Enter insere". Estados: buscando ("Procurando…"); `mode: 'TEXT'` sem resultado ou `NONE` → "Nada encontrado. Confira a referência ou digite à mão."; erro → "Não foi possível procurar agora."
- Link **Digitar à mão** no rodapé troca para o modo manual (o formulário da etapa 1: Referência e Texto). No modo manual, "Voltar para a busca". Sem nenhuma tradução importada (lista vazia ou erro ao listar), o diálogo abre direto no modo manual e não mostra o link de voltar.
- Inserir um hit grava `{ reference, book, chapter, verseStart, verseEnd, translation, verses }` do hit, sem mudar nada.
- **Alterar** um versículo já inserido: se `translation` é nulo, abre no modo manual com referência e texto; se veio da Bíblia, abre no modo de busca com a referência no campo (a busca roda sozinha). "Remover" aparece nos dois modos. Salvar no modo manual um bloco que veio da Bíblia grava-o como manual (`translation: null`, um versículo sem número).
- `VerseView`: com mais de um versículo, cada um começa com o número em sobrescrito pequeno e cinza (o número não é texto do documento além do que já está em `verses[].number`). Com um só, como hoje.
- As consultas usam TanStack Query (`["sermons","bible","translations"]`, com `staleTime` de 1 hora; `["sermons","bible","search", q, translation]`). Resposta atrasada de uma busca antiga não aparece sob o texto novo (a chave da consulta é o texto já com a espera aplicada, e o resultado só é mostrado quando ele é igual ao campo).

- [ ] Testes (mock de `../api/sermons-api`): abre na busca quando há tradução e no manual quando não há; digitar `mt 5 14` chama `searchBible("mt 5 14", "BLIVRE")` depois da espera e lista os três hits com referência e texto/hint; Enter insere o primeiro com os atributos exatos do hit; ↓ + Enter insere o segundo (três versículos); clique insere; sem resultado mostra o texto; "Digitar à mão" mostra o formulário e insere com `translation: null`; alterar um bloco da Bíblia abre com a referência no campo e mostra "Remover"; com duas traduções o seletor troca a tradução da busca; `VerseView` mostra os números só quando há mais de um versículo.
- [ ] Ver falhar, implementar, ver passar; `npx tsc --noEmit -p tsconfig.app.json && npm run lint && npx vitest run && npm run build`. Commit `feat(palavras): inserir versículo pela busca na Bíblia`.

### Task 5: Gates e conferência (controlador)

- [ ] Gates completos da API e do admin com exit 0.
- [ ] Subir local com a Bíblia Livre importada pelo script e conferir no navegador: `mt 5 14` lista versículo, intervalo e seguinte; Enter insere; o intervalo aparece com os números; busca por "luz do mundo" acha Mateus 5:14 e João 8:12; "Digitar à mão" continua funcionando; a palavra salva (o servidor aceita o bloco) e a coluna "Versículos" mostra a referência.
- [ ] Revisão final da etapa; corrigir; mesclar na `qa`.
- [ ] Avisar o usuário: a importação precisa rodar uma vez em cada ambiente (QA e produção), com o comando do `README`.
