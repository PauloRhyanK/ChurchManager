# Palavras, etapa 4: exportar — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O pregador exporta o sermão em PDF (pela impressão do navegador), os slides em arquivo de apresentação e só os versículos em texto, com a opção de incluir as anotações privadas no PDF.

**Architecture:** Tudo é gerado no navegador com os dados que o autor já tem na tela; não há rota nova e o esboço não passa por nenhum serviço a mais. Três construtores puros (HTML de impressão, texto dos versículos, definição dos slides) mais o diálogo "Exportar". O arquivo de apresentação usa `pptxgenjs`, carregado só quando pedido.

**Tech Stack:** React 18 + vitest; `pptxgenjs` (MIT), única dependência nova, versão exata, importada com `import()` dinâmico.

**Spec:** `docs/superpowers/specs/2026-11-19-palavras-pregador-design.md`, seção "Exportar". Decisão do usuário aprovada: PDF pela impressão do navegador; apresentação com `pptxgenjs`.

## Global Constraints

- Gates do admin com exit 0. Nada muda na API.
- **Anotação "Só para mim":** só entra no PDF, e só com a caixa marcada (desmarcada por padrão). A apresentação e o texto dos versículos nunca levam anotação privada, em nenhum caso.
- Todo texto que vai para a janela de impressão passa por `escapeHtml` (a janela tem a origem do painel).
- Única dependência nova: `pptxgenjs`, versão exata (sem `^`), carregada por `import()` dinâmico para não pesar no carregamento do painel.
- O crédito da tradução (campo `attribution` de cada tradução usada) vai no rodapé do PDF e no fim do texto dos versículos; a licença CC BY exige.
- Textos em pt-BR. Nenhum texto diz "IA". Não tocar em `apps/api` nem em `apps/ponte`. Não fazer push.
- Cores dos slides: as mesmas do `SlidePreview` (Minimalista `#05070B` / `#F5F6FA` / `#A5ABBB`; Com fundo `#1E3A8A`).

## Review Focus

1. Título ou texto com `<script>`, `&`, aspas e emoji → aparece como texto no PDF, nunca executa (Tarefa 1).
2. Caixa das anotações desmarcada → nenhum texto de bloco "Só para mim" no HTML; marcada → aparece, identificado como anotação (Tarefa 1). Apresentação e texto nunca têm (Tarefas 1 e 2).
3. Palavra sem slides, sem versículos ou vazia → a opção correspondente fica desligada com a explicação, sem erro (Tarefa 2).
4. Título com acento, barra e pontos → nome de arquivo seguro (`luz-que-nao-se-apaga.pptx`); título vazio → `palavra` (Tarefa 1).
5. Janela de impressão bloqueada pelo navegador → mensagem "Permita janelas pop-up para exportar o PDF." (Tarefa 2).

---

### Task 1: Construtores do PDF e do texto

**Files:**
- Create: `apps/admin/src/lib/print.ts` (move `escapeHtml` e `printHtml` de `features/events/lib/event-report-export.ts`, que passa a reexportá-los; nenhum outro arquivo de eventos muda)
- Create: `apps/admin/src/features/sermons/export/sermon-print.ts`, `export/verses-text.ts`, `export/file-name.ts`
- Test: `export/sermon-print.test.ts`, `export/verses-text.test.ts`, `export/file-name.test.ts`

**Interfaces — Produces:**

```ts
// file-name.ts
export function exportFileName(title: string, extension: 'pptx' | 'txt'): string;   // "luz-que-nao-se-apaga.pptx"; vazio → "palavra.pptx"; até 80 caracteres antes da extensão

// sermon-print.ts
export function buildSermonHtml(input: {
  title: string; document: SermonDoc;
  speech: string;                       // "28 min de fala"
  includePrivate: boolean;
  credits: string[];                    // atribuição de cada tradução usada
}): string;                             // documento HTML completo, pt-BR, pronto para window.print()

// verses-text.ts
export function buildVersesText(input: { title: string; document: SermonDoc; credits: string[] }): string;
export function downloadText(fileName: string, text: string): void;     // Blob text/plain;charset=utf-8, com BOM
export function usedTranslations(document: SermonDoc): string[];        // códigos das traduções citadas, sem repetir, na ordem
```

Decisões:
- `buildSermonHtml`: página A4, margens de 20 mm, fonte serifada (Georgia) 12 pt, `<title>` = título. Cabeçalho com o título e a linha do tempo de fala. Blocos na ordem do documento: parágrafos; listas; Título de seção (`h2`) e Subtítulo (`h3`); Ponto como `h2` numerado ("1. A luz chama", número pela ordem dos pontos); Versículo em caixa com borda à esquerda, o texto (com o número de cada versículo em sobrescrito quando há mais de um) e a referência em negrito; Ilustração e Aplicação em caixa com a etiqueta em maiúsculas; "Só para mim" **só** com `includePrivate`, em caixa cinza tracejada com a etiqueta "Só para mim". Negrito e itálico preservados. `page-break-inside: avoid` nas caixas. Rodapé com os créditos, um por linha, em corpo menor. CSS embutido no próprio HTML; nenhuma requisição externa.
- `buildVersesText`: primeira linha o título; depois, para cada bloco Versículo na ordem, a referência numa linha e o texto na seguinte (versículos de um intervalo juntos, cada um precedido do número), uma linha em branco entre blocos; no fim, uma linha em branco e os créditos. Fim de linha `\r\n`. Sem versículos → só o título e "Nenhum versículo nesta palavra."
- `exportFileName`: sem acento, minúsculas, tudo que não é letra ou dígito vira `-`, sem `-` repetido nem nas pontas.

- [ ] Testes: `buildSermonHtml(EXAMPLE_DOC)` contém título, "1. A luz chama", "2. A luz mostra", os dois versículos com referência, "ILUSTRAÇÃO"/"APLICAÇÃO"; sem `includePrivate` não contém o texto da anotação do exemplo, com `includePrivate` contém; título `<script>alert(1)</script> & "x"` aparece escapado e não há `<script` fora do escape; créditos no rodapé; versículo com três versículos mostra os números; `buildVersesText` com o exemplo dá exatamente o texto esperado (escrito por extenso no teste), sem a anotação privada, com os créditos no fim; documento sem versículo; `usedTranslations`; `exportFileName` nos casos do Review Focus 4; os testes existentes de eventos continuam passando com o reexporte.
- [ ] `npx tsc --noEmit -p tsconfig.app.json && npm run lint && npx vitest run && npm run build`. Commit `feat(palavras): construtores do PDF e do texto dos versículos`.

### Task 2: Apresentação e diálogo Exportar

**Files:**
- Modify: `apps/admin/package.json` (+ `pptxgenjs`, versão exata)
- Create: `apps/admin/src/features/sermons/export/slides-deck.ts`, `export/slides-pptx.ts`, `components/ExportDialog.tsx`
- Modify: `apps/admin/src/features/sermons/pages/SermonEditorPage.tsx` (botão Exportar na barra de cima), `pages/SermonSlidesPage.tsx` (mesmo botão)
- Test: `export/slides-deck.test.ts`, `components/ExportDialog.test.tsx`

**Interfaces — Consumes:** `SlideItem`, `SlideStyle` (`lib/slides.ts`, etapa 3), `buildSermonHtml`, `buildVersesText`, `downloadText`, `usedTranslations`, `exportFileName`, `printHtml`, `listBibleTranslations`. **Produces:**

```ts
// slides-deck.ts (puro, sem pptxgenjs)
export type DeckSlide = { background: string; text: string; textColor: string; bold: boolean; fontSize: number; reference: string | null; referenceColor: string };
export function buildDeck(slides: SlideItem[], style: SlideStyle): DeckSlide[];   // só itens marcados e não privados, na ordem

// slides-pptx.ts
export function downloadPptx(fileName: string, title: string, deck: DeckSlide[]): Promise<void>;   // import('pptxgenjs') dinâmico; layout 16:9
```

Decisões (desenho `PalavraExportar`):
- `buildDeck`: fundo e cores conforme o visual; `TITLE`/`POINT`/`SUMMARY` em negrito; tamanho da fonte em três degraus pelo comprimento do texto (até 60 caracteres: 44; até 140: 32; acima: 24), texto centralizado; referência em 16, abaixo do texto.
- `downloadPptx`: um slide por item, caixa de texto centralizada ocupando 80% da largura, `fit: 'shrink'`; propriedades do arquivo com o título.
- Botão **Exportar** na barra de cima do editor e da conferência: ícone de seta para baixo, `aria-label="Exportar"`. Antes de abrir, `flush()` do salvamento (no editor); o diálogo usa o documento **da tela**.
- `ExportDialog`: título "Exportar"; três botões de linha inteira:
  - **PDF** — "O sermão" — "O texto inteiro, para imprimir ou ler no tablet";
  - **PPT** — "Os slides" — "7 slides, no visual escolhido" (ou "1 slide…"); sem slides: desligado, "Gere os slides primeiro.";
  - **TXT** — "Só os versículos" — "As 3 referências, na ordem" (ou "A referência…"); sem versículos: desligado, "Esta palavra ainda não tem versículos.";
  - caixa "Incluir as anotações “Só para mim”" (desmarcada), com a nota "Vale só para o PDF.".
- Créditos: as traduções usadas (`usedTranslations`) são casadas com `listBibleTranslations()` (consulta já em cache); tradução não encontrada entra só com o código.
- PDF: `printHtml(buildSermonHtml(…))`; se devolver `false`, toast "Permita janelas pop-up para exportar o PDF.". PPT: enquanto gera, o botão mostra "Gerando…"; erro → toast "Não foi possível gerar a apresentação.". TXT: `downloadText`.

- [ ] Testes: `buildDeck` ignora desmarcados e privados (mesmo que um privado venha marcado), mantém a ordem, aplica cores dos dois visuais e os três tamanhos; o diálogo mostra as três opções com as contagens, desliga PPT sem slides e TXT sem versículos; PDF chama `printHtml` com HTML sem a anotação quando a caixa está desmarcada e com ela quando marcada; pop-up bloqueado mostra o toast; PPT chama `downloadPptx` (módulo mockado) com o nome do arquivo e o deck; TXT chama `downloadText`; o botão Exportar aparece no editor e na conferência.
- [ ] `npx tsc --noEmit -p tsconfig.app.json && npm run lint && npx vitest run && npm run build`; conferir no resultado do build que `pptxgenjs` ficou num pedaço separado (não no `index-*.js`). Commit `feat(palavras): exportar sermão, slides e versículos`.

### Task 3: Gates e conferência (controlador)

- [ ] Gates completos do admin (e da API, por garantia) com exit 0.
- [ ] No navegador: abrir Exportar; baixar o TXT e conferir o conteúdo; gerar o PPTX e conferir que o arquivo abre como zip com um slide por item; abrir o PDF com e sem as anotações.
- [ ] Revisão final; corrigir; mesclar na `qa`.
