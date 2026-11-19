# Palavras, etapa 3: slides sem IA e conferência — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O pregador tira os slides do esboço ("Só versículos" ou "Versículos e pontos"), confere a sequência (tirar, reordenar, ajustar o texto dos pontos), escolhe o visual e envia; quem monta o roteiro vê os slides da palavra enviada.

**Architecture:** A sequência de slides é uma lista JSON na própria palavra, tirada do documento por uma função pura (`buildSlides`) com ids determinísticos, o que deixa "Atualizar" preservar os ajustes do pregador (`mergeSlides`). O envio guarda uma cópia só dos itens marcados e nunca dos privados (`publicSlides`); o módulo `worship` lê só essa cópia. As funções puras são duplicadas no painel para a contagem do modal e a prévia.

**Tech Stack:** NestJS + Prisma + `node:test`; React 18 + TanStack Query + shadcn/ui + `@dnd-kit` (já instalado) + vitest. Nenhuma dependência nova.

**Spec:** `docs/superpowers/specs/2026-11-19-palavras-pregador-design.md`, seções "Slides", "Envio para um culto" e "Ligação com o módulo Cultos". Decisão do usuário: o item "Só você" aparece desmarcado e **travado**.

## Global Constraints

- Gates do `AGENTS.md` com exit 0 (API e admin).
- Privacidade (etapa 1) continua valendo: toda consulta a `sermon` filtra por `tenantId` e `authorId`; `worship` nunca lê `sermons`, só `sermon_deliveries`.
- **Um item `PRIVATE` nunca sai da palavra:** o servidor força `included: false` neles em toda escrita e os descarta ao montar a cópia do envio, mesmo que o corpo da requisição os marque. Nenhuma rota de `worship` devolve item `PRIVATE`, texto de bloco "Só para mim" nem o documento.
- "Slides completos" (`FULL`) **não** é implementado: a API responde 400 "Slides completos ainda não estão disponíveis." e o painel mostra a opção desligada com "em breve", sem contagem. Nenhum texto diz "IA".
- DTO com whitelist; o cliente manda só `id`, `included` e `text` de cada item, nunca `kind`, `reference` ou `sourceBlockId`. Corpo montado campo a campo. Textos em pt-BR.
- Nenhuma dependência nova. Não tocar em `apps/ponte`. Não fazer push; commits só na branch atual.
- Valores: versículo com mais de 220 caracteres é dividido em frases; texto de slide editado até 300 caracteres; até 400 itens por palavra; rótulo do item privado até 80 caracteres.
- Cores do visual (do desenho): Minimalista fundo `#05070B`, texto `#F5F6FA`, referência `#A5ABBB`; Com fundo fundo `#1E3A8A`, mesmo texto e referência.

## Review Focus

1. Bloco apagado, movido ou com o texto mudado no esboço depois de gerar → "Atualizar" tira o item do bloco apagado, mantém desmarcados os que o pregador tirou, mantém a ordem que ele deu e o texto que ele editou, e põe o bloco novo na posição do documento (Tarefa 1).
2. Corpo de `PUT /slides` com item `PRIVATE` marcado, com id desconhecido, repetido ou faltando → privado continua desmarcado; ids desconhecidos ou repetidos são 400; item que faltou no corpo é 400 (a lista é sempre inteira) (Tarefa 2).
3. Palavra já enviada: mudar slides ou visual atualiza a cópia do roteiro; palavra já pregada: a cópia não muda mais (Tarefa 2).
4. Versículo de um capítulo inteiro (dezenas de versículos) e versículo muito longo sem pontuação → um slide por versículo, divisão por frases quando passa de 220, e nunca um slide vazio nem um laço sem fim (Tarefa 1).
5. Quem não é o autor abre a prévia no roteiro → vê título e slides, sem link para a palavra; o autor vê o link (Tarefas 2 e 4).

---

### Task 1: Schema e funções puras dos slides

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20261122120000_add_sermon_slides/migration.sql`
- Create: `apps/api/src/modules/sermons/sermon-slides.ts`
- Test: `apps/api/src/modules/sermons/sermon-slides.spec.ts`

**Interfaces — Consumes:** `SermonDoc` (`sermon-document.ts`), `EXAMPLE_DOC`. **Produces:**

```ts
export type SlideMode = 'VERSES' | 'VERSES_AND_POINTS' | 'FULL';
export type SlideStyle = 'MINIMAL' | 'BACKGROUND';
export type SlideKind = 'TITLE' | 'VERSE' | 'POINT' | 'SUMMARY' | 'PRIVATE';
export type SlideItem = {
  id: string;                    // 'title' | `${blockId}:${n}`  (n = 0, 1, 2… dentro do bloco)
  kind: SlideKind;
  sourceBlockId: string | null;  // null no TITLE
  text: string;
  reference: string | null;      // só no VERSE
  included: boolean;
  edited: boolean;               // o pregador mudou o texto na conferência
};
export type PublicSlide = { kind: Exclude<SlideKind, 'PRIVATE'>; text: string; reference: string | null };
export const SLIDE_LIMITS = { verseChars: 220, textChars: 300, items: 400, privateLabel: 80 } as const;

export function buildSlides(title: string, doc: SermonDoc, mode: Exclude<SlideMode, 'FULL'>): SlideItem[];
export function countSlides(title: string, doc: SermonDoc): { VERSES: number; VERSES_AND_POINTS: number };   // sem contar PRIVATE
export function mergeSlides(previous: SlideItem[], fresh: SlideItem[]): SlideItem[];
export function publicSlides(items: SlideItem[]): PublicSlide[];
export function parseStoredSlides(value: unknown): SlideItem[];   // lê a coluna Json; qualquer coisa fora do formato vira []
```

Schema: enums `SermonSlideMode` (`VERSES`, `VERSES_AND_POINTS`, `FULL`) e `SermonSlideStyle` (`MINIMAL`, `BACKGROUND`). `Sermon` ganha `slideMode SermonSlideMode?`, `slideStyle SermonSlideStyle @default(MINIMAL)`, `slides Json @default("[]")`, `slidesRevision Int?`. `SermonDelivery` ganha `slideStyle SermonSlideStyle @default(MINIMAL)` e `slides Json @default("[]")`. Migração só aditiva (`CREATE TYPE`, `ALTER TABLE … ADD COLUMN`), `snake_case` com `@map`.

Regras de `buildSlides` (percorre os blocos de primeiro nível, na ordem; nada dentro de `illustration`/`application` vira slide nesta etapa):
- `VERSES_AND_POINTS` começa com `{ id: 'title', kind: 'TITLE', text: título aparado }` (só se o título não for vazio). `VERSES` não tem título nem pontos.
- Bloco `verse`: um item por versículo de `verses`, na ordem; versículo com mais de 220 caracteres é dividido em pedaços de até 220, cortando depois de `.`, `;`, `:`, `?` ou `!` seguido de espaço; pedaço que ainda passa de 220 é cortado no último espaço antes de 220 (sem espaço: corte seco em 220). Versículo de texto vazio não gera item. `reference` de cada item: se a referência do bloco casa com `^(.*\d+):\d+(?:-\d+)?$` e o versículo tem `number`, é `"<grupo 1>:<number>"` ("Mateus 5:14-16" + 15 → "Mateus 5:15"); senão a referência do bloco inteira. Os ids contam todos os itens do bloco: `v1:0`, `v1:1`, …
- Bloco `point` (nos dois modos, só em `VERSES_AND_POINTS`): `{ id: '<id>:0', kind: 'POINT', text: texto do ponto sem número }`; ponto vazio não gera item.
- Bloco `privateNote` (nos dois modos): entra **no fim** da lista, na ordem do documento, `{ id: '<id>:0', kind: 'PRIVATE', included: false, text: primeiros 80 caracteres do texto, com "…" se cortou }`; nota vazia não gera item.
- Todo item nasce `included: true` (menos `PRIVATE`) e `edited: false`. A lista é cortada em 400 itens (os `PRIVATE` saem primeiro).

`mergeSlides(previous, fresh)`: o resultado tem exatamente os ids de `fresh`. Para id que existia: mantém `included` (menos `PRIVATE`, sempre `false`) e, se `previous.edited`, mantém `text` e `edited: true`; senão usa o texto novo. Ordem: os que já existiam ficam na ordem de `previous`; cada id novo entra logo depois do item que o antecede em `fresh` (se esse já está no resultado), senão no começo; os `PRIVATE` ficam sempre no fim, na ordem de `fresh`.

`publicSlides`: itens com `included` e `kind !== 'PRIVATE'`, na ordem, só `kind`, `text`, `reference`.

- [ ] Testes de `buildSlides`: `EXAMPLE_DOC` em `VERSES` → 2 itens `VERSE` ("João 8:12", "Salmos 119:105") + 1 `PRIVATE` no fim desmarcado; em `VERSES_AND_POINTS` → `TITLE`, `VERSE`, `POINT` "A luz chama", `VERSE`, `POINT` "A luz mostra", e o `PRIVATE` no fim; `countSlides` → `{ VERSES: 2, VERSES_AND_POINTS: 5 }`; bloco "Mateus 5:14-16" com três versículos → referências "Mateus 5:14", "5:15", "5:16" e ids `:0`, `:1`, `:2`; versículo de 500 caracteres com frases → pedaços ≤ 220 terminando em pontuação, e a junção dos pedaços com espaço é igual ao texto; 500 caracteres sem espaço → cortes secos, termina; versículo digitado à mão sem número → referência do bloco; título vazio → sem `TITLE`; ilustração e aplicação não geram item; documento vazio → `[]`; nota privada de 200 caracteres → rótulo de 80 + "…".
- [ ] Testes de `mergeSlides`: item desmarcado continua desmarcado; ordem trocada pelo pregador é mantida; texto editado de um `POINT` é mantido mesmo com o ponto reescrito no esboço, e não editado recebe o texto novo; bloco apagado some; bloco novo entre dois existentes entra depois do anterior; `PRIVATE` marcado em `previous` volta desmarcado e vai para o fim. `publicSlides` nunca devolve `PRIVATE` nem item desmarcado. `parseStoredSlides` com `null`, objeto, item sem `id` → `[]` ou sem o item ruim.
- [ ] Migração conferida com `prisma migrate diff` num Postgres descartável; `npx prisma generate && npx tsc --noEmit -p tsconfig.json && npm test && npm run build`. Commit `feat(palavras): sequência de slides tirada do esboço`.

### Task 2: API dos slides, cópia no envio e prévia para o roteiro

**Files:**
- Create: `apps/api/src/modules/sermons/dto/slides.dto.ts`, `sermon-slides.service.ts`
- Modify: `sermons.controller.ts`, `sermons.module.ts`, `sermons.service.ts` (resposta e sincronização da cópia), `sermon-delivery.service.ts` (cópia no envio; `summaries` com `slideCount`; `slidesForService`)
- Modify: `apps/api/src/modules/worship/worship-services.controller.ts`, `worship-services.service.ts` (rota da prévia; `slideCount` no resumo)
- Test: `apps/api/src/modules/sermons/sermon-slides.service.spec.ts`; acrescentar casos em `sermon-delivery.spec.ts` e `apps/api/src/modules/worship/worship-services.spec.ts`

**Interfaces — Produces:**

```ts
export class GenerateSlidesDto { mode!: 'VERSES' | 'VERSES_AND_POINTS' | 'FULL'; style?: 'MINIMAL' | 'BACKGROUND' }
export class SlideItemInputDto { id!: string; included!: boolean; text?: string }
export class SaveSlidesDto { style?: 'MINIMAL' | 'BACKGROUND'; items!: SlideItemInputDto[] }

// SermonFull (GET /:id e respostas de escrita) ganha:
//   slideMode: SlideMode | null; slideStyle: SlideStyle; slides: SlideItem[]; slidesStale: boolean
// SermonSummary ganha: slideCount: number   (itens marcados não privados)

class SermonSlidesService {
  generate(user: AuthUser, sermonId: string, dto: GenerateSlidesDto): Promise<SermonFull>;
  save(user: AuthUser, sermonId: string, dto: SaveSlidesDto): Promise<SermonFull>;
}
// SermonDeliveryService:
//   summaries(...) → Map<serviceId, { title, preacherName, estimatedMinutes, slideCount }>
//   slidesForService(tenantId, serviceId, viewerUserId): Promise<{ title: string; preacherName: string; slideStyle: SlideStyle; slides: PublicSlide[]; mySermonId: string | null } | null>
```

Rotas novas: `POST /admin/tenants/me/sermons/:id/slides/generate` e `PUT /admin/tenants/me/sermons/:id/slides` (`SERMONS:EDIT`); `GET /admin/tenants/me/worship/services/:id/sermon` (`WORSHIP:VIEW`; 404 "Este culto não tem palavra." sem envio).

Decisões:
- `generate`: `FULL` → 400 "Slides completos ainda não estão disponíveis."; senão `mergeSlides(parseStoredSlides(atual), buildSlides(title, document, mode))` quando o modo é o mesmo de antes, ou `buildSlides` puro quando a palavra não tinha slides ou o modo mudou; grava `slides`, `slideMode`, `slideStyle` (se veio) e `slidesRevision = revision`.
- `save`: a lista de `items` tem de ter **exatamente** os ids da lista gravada, cada um uma vez (senão 400 "A lista de slides está desatualizada. Atualize a página."); a ordem do corpo é a nova ordem, com os `PRIVATE` sempre empurrados para o fim; `included` vale para todos menos `PRIVATE` (sempre `false`); `text` só é aceito em `POINT`, `TITLE` e `SUMMARY`, aparado, 1 a 300 caracteres, e marca `edited: true` quando difere do gravado; em `VERSE` e `PRIVATE` é ignorado. Não mexe em `slidesRevision` nem em `revision`.
- `slidesStale` = `slides.length > 0 && slidesRevision !== revision`.
- Tudo dentro de uma transação que começa com `findOwned(user, id, tx)` e escreve com o filtro de `tenantId` + `authorId`. Salvar o documento (autosave) **não** mexe nos slides.
- **Cópia do envio:** uma função única `syncDeliveryCopy(tx, sermon)` grava no envio `title`, `estimatedSeconds`, `slideStyle` e `slides = publicSlides(...)`, e só quando o envio ainda não passou. Chamada em: `send` (ao criar ou mover), `generate`, `save`, e no `update` de título/documento da etapa 1 (no lugar do trecho que hoje copia só título e tempo).
- `slidesForService` lê só `sermonDelivery` (por `tenantId` + `serviceId`); `mySermonId` é `delivery.sermonId` quando `delivery.authorId === viewerUserId`, senão `null`. O `worship` chama esse método; nenhum código de `worship` lê `sermon`.
- `GET /worship/services/:id` → `sermon: { title, preacherName, estimatedMinutes, slideCount } | null`.

- [ ] Testes: `generate` em palavra sem slides grava a sequência e `slidesRevision`; `FULL` → 400 sem escrita; gerar de novo no mesmo modo preserva item desmarcado e texto editado; trocar de modo recomeça; `save` com ids trocados de ordem grava a nova ordem; `PRIVATE` marcado no corpo fica `false` e no fim; id desconhecido, repetido ou faltando → 400 sem escrita; `text` em `VERSE` é ignorado; `text` de 301 caracteres → 400; palavra de outro autor (inclusive `TENANT_ADMIN`) → 404 sem escrita em `generate` e `save`; `slidesStale` vira `true` depois de salvar o documento e `false` depois de `generate`; palavra Enviada: `save` atualiza `slides` e `slideStyle` do envio, sem nenhum `PRIVATE`; palavra Pregada: o envio não muda; `send` copia os slides atuais; `slidesForService` devolve só `kind`, `text`, `reference` e `mySermonId` só para o autor; a rota de `worship` responde 404 sem envio e a resposta não tem nenhuma chave além das cinco; DTO recusa `kind`, `reference`, `sourceBlockId`, `edited`, e mais de 400 itens.
- [ ] `npx tsc --noEmit -p tsconfig.json && npm test && npm run build`. Commit `feat(palavras): API dos slides e prévia para o roteiro`.

### Task 3: Painel: gerar slides e prévia

**Files:**
- Create: `apps/admin/src/features/sermons/lib/slides.ts` (cópia de `buildSlides`, `countSlides` e dos tipos da API; **não** copiar `mergeSlides`), `lib/slides.test.ts`
- Create: `apps/admin/src/features/sermons/components/GenerateSlidesDialog.tsx`, `components/SlidePreview.tsx`, com testes
- Modify: `apps/admin/src/features/sermons/api/sermons-api.ts` (campos novos; `generateSlides`, `saveSlides`), `pages/SermonEditorPage.tsx`

Decisões:
- `lib/slides.test.ts` confere `buildSlides(EXAMPLE_DOC…)` contra os mesmos valores do teste da API (os dois lados com o mesmo exemplo).
- `SlidePreview({ slide, style, size })`: cartão 16:9 com as cores das restrições globais; `TITLE`, `POINT` e `SUMMARY` em negrito, maior; `VERSE` com peso médio e a referência pequena embaixo; o texto diminui conforme o comprimento (três degraus) para caber sem cortar.
- `GenerateSlidesDialog` (desenho `PalavraSlides`): título "Gerar slides"; grupo de rádio `aria-label="O que mostrar"` com **Só versículos** ("Na ordem em que aparecem"), **Versículos e pontos** ("Mais o título e os pontos"), **Slides completos** ("Cada parte resumida numa frase", desligado, etiqueta "em breve", sem contagem); à direita de cada um "N slides" (ou "1 slide"), de `countSlides` sobre o documento **da tela**; grupo `aria-label="Visual do slide"` com **Minimalista** e **Com fundo**, cada um com a miniatura; botões "Cancelar" e **Montar**. Padrão: "Versículos e pontos" e o visual já gravado. "Montar" desligado quando a opção escolhida tem 0 slides ("Escreva um versículo ou um ponto para montar os slides.").
- "Montar": `flush()` do salvamento; se ainda houver mudança pendente, não continua (toast "Salve a palavra antes de montar os slides."); chama `generateSlides(id, { mode, style })`, atualiza os dados da palavra sem remontar o editor e navega para `/palavras/:id/slides`.
- Barra de cima do editor: o botão principal passa a ser **Gerar slides** (ícone de brilho) quando a palavra não tem slides, e **Slides · N** (leva à conferência) quando tem. O botão "Enviar para um culto" sai da barra do editor (vai para a conferência, Tarefa 4); a situação "Enviada · …" / "Pregada · …" continua aparecendo na barra como texto.

- [ ] Testes: `lib/slides` contra os valores do exemplo; `SlidePreview` mostra texto e referência e muda o fundo conforme o visual; o diálogo mostra as contagens, "Slides completos" desligado com "em breve", padrão em "Versículos e pontos"; "Montar" chama `generateSlides` com modo e visual; não chama quando o salvamento falha; com 0 slides fica desligado; na página, sem slides aparece "Gerar slides" e com slides "Slides · 5".
- [ ] `npx tsc --noEmit -p tsconfig.app.json && npm run lint && npx vitest run && npm run build`. Commit `feat(palavras): gerar slides a partir do esboço`.

### Task 4: Painel: conferência, envio e prévia no roteiro

**Files:**
- Create: `apps/admin/src/features/sermons/pages/SermonSlidesPage.tsx`, `components/SlideList.tsx`, com testes
- Modify: `apps/admin/src/routes/AppRoutes.tsx` (`/palavras/:id/slides`, dentro do layout com menu, atrás de `PermissionRoute module="SERMONS"`)
- Modify: `apps/admin/src/features/worship/api/worship-api.ts` (`getServiceSermon`; `slideCount`), `apps/admin/src/features/worship/components/service/MomentsTab.tsx`; Create: `apps/admin/src/features/worship/components/service/SermonPreviewDialog.tsx`, com teste

Decisões (desenho `PalavraEnviar`):
- Topo: voltar (`aria-label="Voltar para o esboço"`, vai para `/palavras/:id`), o título da palavra, e à direita **Enviar para um culto** (abre o `SendToServiceDialog` da etapa 1; palavra enviada mostra "Enviada · dom 22/11, 19h" e abre o mesmo diálogo; palavra pregada mostra "Pregada · …" sem diálogo). O subtítulo do diálogo passa a ser "<título> · N slides".
- Coluna esquerda, cartão "**Tirado do esboço** · N slides" (N = marcados): uma linha por item com a alça de arrastar (`aria-label="Arrastar para mudar a ordem"`; `@dnd-kit`, reaproveitando o padrão de `features/worship/components/service/SortableList.tsx`), a caixa de marcar, o tipo em maiúsculas pequenas ("Título", "Versículo", "Ponto", "Só você") e o texto (`VERSE` mostra a referência). Clicar no texto de `TITLE`/`POINT` abre a edição no lugar (Enter confirma, Esc cancela, até 300). Item `PRIVATE`: fundo cinza claro, cadeado, caixa desmarcada e **desligada**, sem alça, com `title="Anotação só para você. Não vai para o telão."`.
- Cada mudança (marcar, reordenar, editar) salva a lista inteira com `saveSlides` (otimista; em erro volta ao estado do servidor e mostra "Não foi possível salvar os slides."). O corpo leva só `id`, `included` e, quando editado, `text`.
- Coluna direita, "**No telão**": grade de `SlidePreview` dos itens marcados, na ordem, e o controle do visual ("Minimalista · trocar" alterna entre os dois e salva).
- Faixa de aviso quando `slidesStale`: "O esboço mudou depois destes slides." com **Atualizar** (chama `generateSlides` com o modo atual; os ajustes são preservados). Menu "Gerar de novo" abre o `GenerateSlidesDialog` (trocar o modo recomeça a sequência; o diálogo avisa: "Trocar o que mostrar refaz a sequência do zero.").
- Palavra sem slides nessa rota: "Esta palavra ainda não tem slides." com o botão "Gerar slides". Palavra de outro autor ou inexistente: "Palavra não encontrada."
- **No roteiro:** a etiqueta da palavra no momento Palavra vira um botão que abre `SermonPreviewDialog`: título, "Palavra de <pregador>", a grade de `SlidePreview` (somente leitura) ou "Esta palavra ainda não tem slides."; quando a resposta traz `mySermonId`, o link "Abrir a palavra" (`/palavras/<id>`). O `worship` importa `SlidePreview` de `features/sermons/components` (componente de apresentação, sem chamada à API de palavras).

- [ ] Testes: a lista mostra tipos, textos e referências; desmarcar chama `saveSlides` com a lista inteira e o item desmarcado; reordenar (função de reordenar testada direto, sem simular o arrasto) manda a nova ordem; editar o texto de um ponto manda `text`; item privado tem a caixa desligada e não vai marcado no corpo; a contagem e a prévia refletem só os marcados; o aviso de esboço alterado aparece com `slidesStale` e "Atualizar" chama `generateSlides` com o modo atual; trocar o visual salva o estilo; sem slides mostra o estado vazio; no roteiro, clicar na etiqueta busca e mostra os slides, com "Abrir a palavra" só quando há `mySermonId`.
- [ ] `npx tsc --noEmit -p tsconfig.app.json && npm run lint && npx vitest run && npm run build`. Commit `feat(palavras): conferência dos slides e prévia no roteiro`.

### Task 5: Gates e conferência (controlador)

- [ ] Gates completos da API e do admin com exit 0.
- [ ] No navegador: gerar "Versículos e pontos", tirar um item, reordenar, editar um ponto, trocar o visual, enviar para um culto; abrir o roteiro como outro usuário e ver a prévia sem a anotação privada; mudar o esboço e usar "Atualizar".
- [ ] Revisão final da etapa; corrigir; mesclar na `qa`.
