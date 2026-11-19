# Palavras: identidade visual dos slides — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Os slides da Palavra (geração com e sem IA, prévia e exportação) seguem o manual de identidade visual da Igreja Paraíso: quatro modelos, paleta, fontes, medidas em 1920×1080, texto longo dividido em vez de encolhido, e versículo sempre fiel à base bíblica com a tradução identificada.

**Architecture:** Cada item de slide passa a guardar o modelo (`layout` M01–M04) e os textos de título de contexto, subtítulo e tradução. A decisão do modelo e a divisão de texto são funções puras em `sermon-slides.ts` (API, copiadas para o painel). Em "Slides completos" a IA escolhe o modelo e escreve só subtítulos; o texto do versículo nunca vem dela. O painel desenha a partir de uma única descrição de slide em 1920×1080, usada pela prévia (em escala) e pela exportação `.pptx` (sem encolher fonte).

**Tech Stack:** NestJS + `node:test`; React + vitest; `@anthropic-ai/sdk` e `pptxgenjs` já instalados. Nenhuma dependência nova. Nenhuma migração (os slides são JSON).

**Spec:** `docs/identidade-slides.md` (o manual e a seção "Como o sistema aplica", que fixa todos os números).

## Global Constraints

- Gates do `AGENTS.md` com exit 0 (API e admin). Branch `feat/palavras-identidade-slides`, criada da `origin/main`. **Não fazer merge nem push fora desta branch.**
- Os números (limites de caracteres, faixas de fonte, tracking, espaços, cores, margens) são os de `docs/identidade-slides.md`, seção "Como o sistema aplica". Ficam em constantes num lugar só de cada lado.
- **A fonte nunca sai da faixa do manual.** Texto que passa do limite do modelo é dividido em mais slides. A exportação não usa `fit: shrink`.
- **Versículo fiel:** o texto de um item `VERSE` vem sempre do bloco do esboço. A resposta da IA não tem campo de texto bíblico; nada do que ela devolve altera `text` ou `reference` de um versículo.
- A tradução é identificada: item `VERSE` guarda `version` (código do bloco, ex.: `BLIVRE`) e a referência é mostrada como "Mateus 5:14 · BLIVRE". Versículo digitado à mão (sem tradução) mostra só a referência.
- Privacidade das etapas anteriores continua valendo: consulta a `sermon` com `tenantId` e `authorId`; `worship` só lê `sermon_deliveries`; item `PRIVATE` nunca sai nem é marcado; texto "Só para mim" nunca vai ao provedor; chave só em variável de ambiente.
- Compatibilidade: itens gravados antes desta mudança (sem `layout`, `heading`, `subtitle`, `version`) continuam válidos; a leitura preenche os padrões. A cópia do envio (`sermon_deliveries.slides`) ganha campos, sem perder `kind`, `text` e `reference`.
- Só duas fontes: a de título (Palast Var, com Playfair Display Italic como substituta enquanto não houver arquivo licenciado) e Poppins. Nenhum arquivo de fonte comercial no repositório.
- Textos em pt-BR. DTO com whitelist; corpo campo a campo. Não tocar em `apps/ponte`.

## Review Focus

1. Ponto de 200 caracteres, título da palavra de 120 e subtítulo editado de 300 → divididos ou recusados conforme a regra, nunca desenhados com fonte abaixo da faixa (Tarefa 1 e 2).
2. IA devolve modelo que não vale para aquele alvo (04 para um ponto, 01 para um resumo), subtítulo vazio em 02/04, ou texto diferente para um versículo → modelo corrigido para o padrão, subtítulo vazio rebaixa o modelo, versículo intacto (Tarefa 1).
3. Modelo 04 com versículo de 300 caracteres → vira um slide 02 e os slides 03 do versículo; nenhum slide 04 acima do limite (Tarefa 1).
4. Slides gravados antes desta mudança e cópias de envio antigas → abrem, mostram e exportam com os modelos padrão, sem erro (Tarefas 1 e 2).
5. Versículo digitado à mão, sem tradução nem número → modelo 03 com a referência sozinha, sem " · " sobrando (Tarefas 1 e 2).

---

### Task 1: API — modelos, limites, divisão, IA e cópia do envio

**Files:**
- Modify: `apps/api/src/modules/sermons/sermon-slides.ts`, `sermon-slides.spec.ts`
- Modify: `apps/api/src/modules/sermons/ai/sermon-summarizer.ts`, `ai/anthropic-summarizer.ts`, `ai/anthropic-summarizer.spec.ts`
- Modify: `apps/api/src/modules/sermons/sermon-slides.service.ts`, `sermon-slides.service.spec.ts`, `delivery-copy.ts`, `dto/slides.dto.ts`, `scripts/sermon-ai-smoke.ts`, `ai/README.md`
- Modify (só o que os tipos exigirem): specs de `sermon-delivery`, `worship-services`, `worship-sermon-link`

**Interfaces — Produces** (em `sermon-slides.ts`, que continua sem dependências além de `import type`):

```ts
export type SlideLayout = 'M01' | 'M02' | 'M03' | 'M04';
export type SlideItem = {
  id: string; kind: SlideKind; sourceBlockId: string | null;
  text: string;                 // TITLE/POINT: o título; VERSE: o texto bíblico; SUMMARY: a frase (vai como subtítulo)
  reference: string | null;     // só VERSE
  included: boolean; edited: boolean;
  layout: SlideLayout;
  heading: string | null;       // título de contexto de VERSE e SUMMARY (o Ponto atual; antes do primeiro, o título da palavra)
  subtitle: string | null;      // POINT em M02; VERSE em M04
  version: string | null;       // só VERSE: código da tradução do bloco
};
export const SLIDE_MODEL_LIMITS = {
  M01: { title: 75 },
  M02: { title: 60, subtitle: 150 },
  M03: { title: 50, verse: 220 },
  M04: { title: 45, subtitle: 90, verse: 160 },
} as const;
/** O que a tela mostra, já no formato do modelo. */
export type SlideFace = {
  layout: SlideLayout; title: string; subtitle: string | null;
  verse: string | null; reference: string | null;   // reference já com " · VERSÃO" quando houver
};
export function slideFace(item: Pick<SlideItem, 'kind' | 'text' | 'reference' | 'layout' | 'heading' | 'subtitle' | 'version'>): SlideFace;
export type PublicSlide = { kind: Exclude<SlideKind, 'PRIVATE'>; text: string; reference: string | null } & SlideFace;

export type AiTarget = {
  id: string;                    // alvo de resumo: id do slide ('opening:0', `${blockId}:0`); ponto: `${pointId}:0`; versículo: o id do BLOCO
  sourceBlockId: string | null;
  part: 'OPENING' | 'ILLUSTRATION' | 'APPLICATION' | 'SECTION' | 'POINT' | 'VERSE';
  label: string;                 // rótulo da parte; no POINT o título do ponto; no VERSE a referência
  text: string;                  // texto de contexto (no VERSE, o texto bíblico, só para leitura)
};
export type AiDecision = { layout: SlideLayout; text: string };   // text = subtítulo/frase; '' quando o modelo não tem
export function aiTargets(doc: SermonDoc): AiTarget[];             // substitui summaryTargets (que continua exportada, devolvendo só os alvos de resumo)
export function cleanDecisions(targets: AiTarget[], raw: { id: string; model: string; text: string }[]): Record<string, AiDecision>;
export function buildSlides(title: string, doc: SermonDoc, mode: SlideMode, decisions?: Record<string, AiDecision>): SlideItem[];
```

Decisões:
- **Padrões sem IA:** `TITLE` → M01; `POINT` → M01; `VERSE` → M03 com `heading` = texto do último Ponto antes dele (ou o título da palavra, ou a referência do bloco se o título for vazio) e `version` = `translation` do bloco; `SUMMARY` → M02 com `heading` de contexto (Abertura: título da palavra; Ilustração e Aplicação: o Ponto atual ou o título; seção: o texto do título de seção). Modo `VERSES` → só itens `VERSE` em M03.
- **Divisão:** texto de `TITLE`/`POINT` acima de 75 caracteres é dividido em itens de continuação no último espaço (`title`, `title:1`…; `<id>:0`, `<id>:1`…), todos M01. Versículo continua dividido em frases com o limite do modelo (220 em M03; 160 em M04). `heading` acima do limite do modelo é cortado na última palavra que cabe, com "…".
- **`slideFace`:** `TITLE`/`POINT` → `{ title: text, subtitle }`; `VERSE` → `{ title: heading, verse: text, reference: reference + (version ? ' · ' + version : '') }`; `SUMMARY` → `{ title: heading, subtitle: text }`. O `layout` devolvido é sempre coerente com o que existe: M02/M04 sem subtítulo viram M01/M03; item antigo sem `layout` recebe o padrão do tipo; `heading` nulo num `VERSE` antigo usa a referência como título.
- **IA (`FULL`):** `aiTargets` = os alvos de resumo de hoje + um alvo `POINT` por Ponto com texto (texto = parágrafos e listas da seção do ponto, mínimo de 12 palavras para poder ganhar subtítulo) + um alvo `VERSE` por bloco Versículo. Máximo de 60 alvos e 6.000 caracteres por alvo, como hoje.
- **`cleanDecisions`:** só ids pedidos, o primeiro de cada. Modelo permitido por parte: resumos → sempre M02; `POINT` → M01 ou M02; `VERSE` → M03 ou M04; qualquer outro valor vira o padrão. `text` limpo como hoje e cortado em 90 caracteres; M02/M04 com texto vazio rebaixam para M01/M03; resumo sem texto é descartado.
- **`buildSlides(…, 'FULL', decisions)`:** aplica as decisões. Versículo em M04 cujo texto dividido em 160 daria mais de um slide, ou cujo `heading` cortado ficaria vazio, é **dividido em dois**: um item `SUMMARY` M02 de id `<blockId>:lead` (título de contexto + o subtítulo) seguido dos itens `VERSE` em M03. Só o primeiro pedaço de um versículo em M04 leva o subtítulo.
- **Pedido à IA** (`AnthropicSummarizer`): o esquema de saída passa a `{ slides: [{ id, model: '01' | '02' | '03' | '04', text }] }` (enum no esquema). A instrução de sistema traz as regras do manual resumidas: os quatro modelos e quando usar cada um, os limites de texto, "se não couber, divide; nunca encolhe", o subtítulo nunca compete com o título, e **"você não devolve nem altera texto bíblico; para um versículo você só escolhe o modelo 03 ou 04 e, no 04, escreve um subtítulo curto"**. O conteúdo do sermão continua indo como dado, em JSON, na mensagem do usuário. `SermonSummarizer.summarize` passa a devolver `{ id, model, text }[]`. Demais regras do pedido (sem `thinking`, sem amostragem, `stop_reason`, fallbacks, erros) não mudam.
- **Edição (`save`):** `text` continua aceito só em `TITLE`, `POINT` e `SUMMARY`, agora com o limite do modelo: `TITLE`/`POINT` até 75, `SUMMARY` até 150 (400 "O texto passa do limite deste modelo de slide. Divida em dois."). Novo campo opcional `subtitle` por item, aceito só em `POINT` (até 150; vazio remove e volta a M01) e `VERSE` (até 90; vazio remove e volta a M03; recusado com 400 se o versículo daquele item passa de 160 caracteres). `layout`, `heading`, `version`, `kind`, `reference` nunca vêm do cliente.
- **`mergeSlides`:** preserva também `subtitle` e `layout` de itens editados.
- **Cópia do envio e leitura:** `publicSlides` devolve `PublicSlide` com os campos de `slideFace`. `readDeliverySlides` aceita linhas antigas (só `kind`, `text`, `reference`) e as completa com `slideFace`; continua descartando o que não reconhece. `parseStoredSlides` aceita itens sem os campos novos e valida os novos quando presentes (`layout` da lista; `heading`/`subtitle`/`version` texto ou nulo, cortados nos limites).

- [ ] Testes de `sermon-slides`: padrões de cada tipo e de cada modo; `heading` do versículo é o ponto atual e, antes do primeiro, o título; `version` vem do bloco; ponto de 200 caracteres → três itens M01 de até 75; título de 120 → dois; versículo de 300 em M03 → dois itens de até 220 cuja junção é o texto; `heading` de 80 → cortado com "…" em até 50; `slideFace` nos quatro modelos, com e sem versão, e para item antigo sem os campos novos; `cleanDecisions` com modelo inválido por parte, texto vazio, id estranho e duplicado; `FULL` com decisão M02 num ponto e M04 num versículo curto; M04 num versículo de 300 → `<id>:lead` em M02 + itens M03, nenhum M04; **fidelidade**: com decisões para todos os versículos, `text` e `reference` de todo item `VERSE` são exatamente os do bloco do documento.
- [ ] Testes do resumidor: o esquema enviado tem o enum de modelos e não tem campo para texto bíblico; a instrução de sistema contém as regras (os quatro modelos, os limites, a frase sobre não alterar texto bíblico); a resposta `{ slides: [...] }` é lida; os testes existentes de erros e privacidade continuam passando.
- [ ] Testes do serviço: `FULL` grava `layout`, `heading`, `subtitle`, `version`; resposta da IA tentando mudar um versículo (id de versículo com `text` longo e modelo 03) não muda o texto gravado; `save` com `subtitle` em ponto e em versículo; limites de `text`/`subtitle` → 400 sem escrita; corpo com `layout` ou `heading` → 400 (whitelist); cópia do envio traz os campos de `slideFace` e nenhum `PRIVATE`; `readDeliverySlides` com linha antiga.
- [ ] `npx tsc --noEmit -p tsconfig.json && npm test && npm run build`. Commit `feat(palavras): modelos de slide do manual de identidade, com divisão de texto e versículo fiel`.

### Task 2: Painel — prévia e exportação na identidade

**Files:**
- Modify: `apps/admin/src/features/sermons/lib/slides.ts` (cópia fiel das funções e tipos da Tarefa 1), `lib/slides.test.ts`
- Create: `apps/admin/src/features/sermons/lib/slide-identity.ts` (constantes: paleta, temas, fontes, faixas de tamanho, tracking, espaços, margens), `lib/slide-layout.ts` (geometria pura), com testes
- Create: `apps/admin/src/features/sermons/slide-identity.css` (Google Fonts: Poppins 500/600/700 e Playfair Display itálico 500/700; `@font-face` da Palast Var apontando para `/fonts/`)
- Modify: `components/SlidePreview.tsx`, `export/slides-deck.ts`, `export/slides-pptx.ts`, `components/SlideList.tsx`, `components/GenerateSlidesDialog.tsx`, `pages/SermonSlidesPage.tsx`, `api/sermons-api.ts`, `lib/slide-edits.ts`, `apps/admin/src/features/worship/components/service/SermonPreviewDialog.tsx`, com os testes; `apps/admin/public/fonts/LEIA-ME.md`

**Interfaces — Produces:**

```ts
// slide-layout.ts — tudo em pixels numa tela de 1920×1080
export type SlideBlock = {
  role: 'title' | 'subtitle' | 'verse' | 'reference';
  text: string; fontFamily: 'title' | 'body'; fontSize: number; fontWeight: 500 | 600 | 700; italic: boolean;
  tracking: number;            // em milésimos de em (ex.: -70)
  lineHeight: number; align: 'center' | 'left';
  x: number; y: number; width: number; height: number;   // caixa estimada, para a exportação
  gapBefore: number;           // espaço até o bloco anterior, para a prévia
};
export type SlideDrawing = { width: 1920; height: 1080; background: string; color: string; layout: SlideLayout; align: 'center' | 'left'; blocks: SlideBlock[] };
export function drawSlide(face: SlideFace, style: SlideStyle): SlideDrawing;
```

Decisões:
- Tamanho da fonte escolhido **dentro da faixa do modelo** pelo comprimento do texto (três degraus por bloco, do maior para o menor da faixa); abaixo do mínimo nunca. Texto que ainda assim passa do limite (dado antigo ou editado antes desta mudança) é mostrado com o mínimo da faixa e cortado em linhas na prévia; a exportação o parte em mais de um slide com a mesma regra da API.
- Temas: `MINIMAL` passa a se chamar **Azul institucional** na interface e `BACKGROUND`, **Verde profundo**, com as cores de `docs/identidade-slides.md` (M01 em azul profundo no tema institucional). Os valores gravados não mudam.
- Margens de segurança 240/190; M01 no centro óptico (centro vertical deslocado 3% para cima); M02 e M04 em coluna centralizada na vertical; M03 com o título no topo da área segura e o bloco versículo + referência centralizado no espaço restante. Alinhamento à esquerda para o slide inteiro quando o versículo passa de 110 caracteres ou o título de 35; senão centralizado.
- `SlidePreview` desenha um quadro de 1920×1080 com `drawSlide` e o reduz com `transform: scale()` para a largura pedida (`sm`/`md`/`lg` continuam), em coluna flexível com os espaços de `gapBefore`; a referência em negrito. Recebe o slide no formato `SlideFace` (aceita `PublicSlide` e item do editor).
- Exportação: apresentação em 1920×1080 (layout próprio de 20 × 11,25 pol; 96 px por polegada; fonte em pontos = px × 0,75), uma caixa de texto por bloco na posição de `drawSlide`, sem `fit`, com `charSpacing` equivalente ao tracking. Fonte do título: `import.meta.env.VITE_SLIDE_TITLE_FONT` ou "Playfair Display"; corpo "Poppins".
- Conferência (`SlideList`): cada linha mostra o selo do modelo ("Modelo 03"); ponto e versículo ganham "Adicionar subtítulo" / edição do subtítulo no lugar (limites da Tarefa 1; no versículo com mais de 160 caracteres o controle não aparece); o corpo de `saveSlides` passa a levar `subtitle` quando alterado.
- `apps/admin/public/fonts/LEIA-ME.md`: quais arquivos pôr ali para ativar a Palast Var e que eles não devem ser commitados sem licença.

- [ ] Testes: `lib/slides` com os mesmos valores do teste da API; `drawSlide` nos quatro modelos e nos dois temas (cores, fontes, tamanhos dentro da faixa, tracking, alinhamento, caixas dentro da área segura e sem sobreposição); texto longo usa o mínimo da faixa, nunca menos; `SlidePreview` mostra título, subtítulo, versículo e referência com a tradução, em negrito; a exportação gera um slide por item marcado, com as caixas e fontes de `drawSlide`, sem `fit`, e o teste de fumaça do `.pptx` real continua passando; `SlideList` mostra o selo do modelo e salva o subtítulo; rótulos "Azul institucional" e "Verde profundo" no diálogo e na conferência; a prévia do roteiro funciona com cópia antiga (só `kind`, `text`, `reference`).
- [ ] `npx tsc --noEmit -p tsconfig.app.json && npm run lint && npx vitest run && npm run build`. Commit `feat(palavras): prévia e exportação dos slides na identidade visual`.

### Task 3: Revisão, gates e prints (controlador)

- [ ] Revisão final da branch; uma leva de correções; gates completos.
- [ ] Prints dos quatro modelos gerados (ambiente local).
- [ ] PR contra a `qa`, sem merge, explicando a Palast Var.
