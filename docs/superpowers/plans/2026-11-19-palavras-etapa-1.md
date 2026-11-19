# Palavras, etapa 1: biblioteca, editor e envio — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O pregador escreve a palavra num editor de documento com blocos de sermão, vê a estrutura e o tempo de fala, e a envia a um culto; o roteiro mostra o título.

**Architecture:** Módulo Nest novo `sermons` (rotas `admin/tenants/me/sermons/*`, permissão `SERMONS`). A palavra guarda o documento do editor (JSON do ProseMirror, esquema restrito) numa coluna; estrutura, versículos e tempo de fala são derivados por uma função pura duplicada na API e no painel. O envio (`SermonDelivery`) é uma cópia só do que é público e é a única coisa que o módulo `worship` lê; o casamento com o culto por data e hora é outra função pura, chamada dentro da transação que cria, muda ou apaga um culto.

**Tech Stack:** NestJS + Prisma + class-validator + `node:test`; React 18 + Vite + shadcn/ui + TanStack Query + Tiptap + vitest.

**Spec:** `docs/superpowers/specs/2026-11-19-palavras-pregador-design.md` (aprovada em 19/11/2026 com as recomendações: Tiptap; tempo de fala a calibrar; uma palavra, um envio; troca com confirmação; nem o administrador lê o esboço dos outros).

**Pré-requisito:** o módulo Cultos (`claude/cultos-musicas-roteiro-332cc9`) já na `qa`, e esta branch atualizada com a `qa`. Este plano foi escrito contra o commit `edf89f0` daquela branch. **Antes da Tarefa 1**, conferir que estes pontos continuam como descritos, e ajustar a tarefa se mudaram: `WorshipMomentKind` (`PRE_SERVICE`, `GENERIC`, `WORSHIP`); `MOMENT_KINDS` em `worship/dto/service.dto.ts`; `DEFAULT_TEMPLATE` em `worship/service-schedule.ts`; `create`/`update`/`remove`/`list` e `toServiceResponse` em `worship/worship-services.service.ts`; `MomentsTab.tsx`; o grupo "Cultos" em `AppSidebar.tsx`; `routes/AppRoutes.tsx`.

## Global Constraints

- Gates do `AGENTS.md` com exit 0 (API e admin). A API não tem ESLint.
- Tenant **e autor** sempre do JWT. Toda consulta a `sermons` filtra por `tenantId` e `authorId = user.userId`, sem exceção para `TENANT_ADMIN` nem `PLATFORM_ADMIN`. Palavra de outro autor ou de outro tenant → 404 sem escrever.
- Nenhuma rota de `worship` lê a tabela `sermons`; só `sermon_deliveries`.
- DTO com whitelist + `forbidNonWhitelisted`; não aceitar campo que o servidor devolve ou calcula.
- Corpo de escrita montado campo a campo no painel.
- Textos e mensagens em pt-BR. Nenhum texto da interface diz "IA".
- Dependências novas, só estas, com versão exata fixada (sem `^`): `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit` no `apps/admin`. Nada do Tiptap pago.
- Não tocar em `apps/ponte`. Nenhum segredo no repositório. Não fazer push na `main` nem merge na `qa`.
- Fora desta etapa: Bíblia e busca de versículo, slides, exportar, IA. As colunas e enums de slides entram na etapa 3, não agora.
- Limites do documento: 3.000 nós; 300.000 caracteres de texto; 8 níveis; `id` até 36; `reference` até 120; 200 versículos por bloco. Título até 255.
- Tempo de fala: 130 palavras por minuto; folga de Ponto 60 s, Ilustração 90 s, Aplicação 60 s; "Só para mim" não conta.

## Review Focus

1. Copiar e colar um bloco dentro do editor duplica o `id` → cada bloco termina com `id` único, e a estrutura não mostra duas seções com o mesmo `id` (Tarefa 9).
2. O salvamento automático falha (rede) ou responde 409 (outra aba) → o texto na tela não é perdido nem substituído; aparece a mensagem e nada é salvo por cima (Tarefa 10).
3. Palavra enviada e depois o culto é apagado ou muda de data → o envio volta a guardado ou acompanha o culto, conforme `pinned`; a lista do pregador continua coerente (Tarefas 4 e 7).
4. Documento vazio, ou só com "Só para mim" → derivação devolve zero seções e 0 s, sem erro; a lista mostra "sem pontos ainda" (Tarefa 3).
5. Envio para 22/11 às 19:00 em `America/Sao_Paulo`: às 21:59 UTC ainda é "Enviada", às 22:01 UTC é "Pregada"; a conta não usa o fuso do servidor (Tarefa 4).

---

### Task 1: Schema, migrações, permissão `SERMONS` e momento `SERMON`

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20261120120000_add_sermons/migration.sql`
- Create: `apps/api/prisma/migrations/20261120120100_sermon_moment_kind/migration.sql`
- Modify: `apps/api/src/modules/access/permissions.ts` (`PERMISSION_MODULES` + `SERMONS`)
- Modify: `apps/api/src/modules/worship/dto/service.dto.ts` (`MOMENT_KINDS` + `'SERMON'`), `apps/api/src/modules/worship/service-schedule.ts` (o momento "Palavra" do `DEFAULT_TEMPLATE` passa a `kind: 'SERMON'`)
- Modify: `apps/admin/src/lib/auth-storage.ts`, `apps/admin/src/features/access/permissions.ts` (módulo `SERMONS`, rótulo "Palavras", descrição "Sermões do pregador: esboço, slides e envio para o culto."; modelo de grupo "Pregadores", descrição "Escreve as palavras e as envia para o culto.", `SERMONS: EDIT`)
- Modify: `apps/admin/src/features/worship/components/service/MomentsTab.tsx` e o tipo `MomentKind` do painel (oferecer o tipo "Palavra")

Schema (nomes de coluna em `snake_case` com `@map`, como o resto do arquivo):

- `PermissionModule` + `SERMONS`; `WorshipMomentKind` + `SERMON`.
- `Sermon` → `sermons`: `id`, `tenantId` (Cascade), `authorId` → `AdminUser` (Cascade), `title` VarChar(255) default `"Sem título"`, `document` Json default `{"type":"doc","content":[]}`, `revision` Int default 0, `baseReference` VarChar(120)?, `pointCount` Int default 0, `verseRefs` Text default `""`, `estimatedSeconds` Int default 0, `createdAt`, `updatedAt`. Índice `(tenantId, authorId, updatedAt)`.
- `SermonDelivery` → `sermon_deliveries`: `id`, `tenantId` (Cascade), `sermonId` Uuid? **@unique** → `Sermon` (SetNull), `authorId` Uuid? → `AdminUser` (SetNull), `date` Date, `startTime` VarChar(5), `serviceId` Uuid? **@unique** → `WorshipService` (SetNull), `pinned` Boolean default false, `title` VarChar(255), `preacherName` VarChar(255), `estimatedSeconds` Int default 0, `createdAt`, `updatedAt`. Índice `(tenantId, date)`.
- Relações inversas em `Tenant`, `AdminUser` e `WorshipService`.

Duas migrações, porque o Postgres não deixa usar um valor de enum na mesma transação em que ele é criado:

1. `add_sermons`: `ALTER TYPE "PermissionModule" ADD VALUE 'SERMONS'`; `ALTER TYPE "WorshipMomentKind" ADD VALUE 'SERMON'`; `CREATE TABLE` das duas tabelas com índices e chaves.
2. `sermon_moment_kind`:

```sql
UPDATE "worship_service_moments" SET "kind" = 'SERMON' WHERE "name" = 'Palavra' AND "kind" = 'GENERIC';

UPDATE "worship_service_templates" t SET "moments" = (
  SELECT jsonb_agg(
    CASE WHEN m->>'name' = 'Palavra' AND m->>'kind' = 'GENERIC'
         THEN jsonb_set(m, '{kind}', '"SERMON"') ELSE m END
    ORDER BY ord)
  FROM jsonb_array_elements(t."moments") WITH ORDINALITY AS e(m, ord)
) WHERE jsonb_typeof(t."moments") = 'array' AND jsonb_array_length(t."moments") > 0;
```

- [ ] Editar o schema e escrever as migrações à mão; conferir com `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url …` que não sobra diferença.
- [ ] Aplicar num banco local com um culto do modelo padrão já criado e conferir que o momento "Palavra" virou `SERMON`.
- [ ] `npx prisma generate && npx tsc --noEmit -p tsconfig.json && npm test` → exit 0 (os testes de permissão e de `worship` continuam verdes; o de `computeSchedule` não depende do tipo do momento Palavra).
- [ ] Admin: `npx tsc --noEmit -p tsconfig.app.json && npx vitest run` → exit 0.
- [ ] Commit `feat(palavras): schema, migrações, permissão SERMONS e momento Palavra`.

### Task 2: Documento da palavra: tipos e validador

**Files:**
- Create: `apps/api/src/modules/sermons/sermon-document.ts`
- Test: `apps/api/src/modules/sermons/sermon-document.spec.ts`

**Interfaces — Produces:**

```ts
export type SermonDoc = { type: 'doc'; content: SermonBlock[] };   // tipos exatamente como na spec, "Formato de armazenamento"
export type SermonBlock = …; export type VerseAttrs = …;
export const DOC_LIMITS = { nodes: 3000, chars: 300_000, depth: 8, id: 36, reference: 120, verses: 200 } as const;
export const EMPTY_DOC: SermonDoc;
/** Devolve o documento aceito ou lança BadRequestException com mensagem em pt-BR. */
export function validateSermonDocument(input: unknown): SermonDoc;
```

O validador percorre a árvore e aceita **só**: os tipos de nó da spec; em cada nó, só os atributos listados para ele, com o tipo certo (`heading.level` 2 ou 3; `verse.book` 1–66 ou `null`; `verse.verses[].number` inteiro ≥ 1 ou `null`); marcas `bold` e `italic`; `content` conforme o esquema (`verse` sem `content`; `illustration`/`application`/`privateNote` só com `paragraph`, `bulletList`, `orderedList`; `point` e `heading` só com inline). Não corrige nem descarta em silêncio: o que está fora do esquema é erro.

- [ ] Testes: (a) aceita o documento de exemplo (o do desenho `Palavra`: versículo, parágrafo, ponto, versículo, ilustração, "só para mim", ponto, parágrafo, aplicação); (b) recusa tipo de nó desconhecido (`image`), atributo a mais (`paragraph.attrs.style`), marca `link`, `heading` nível 1, `verse` com `content`; (c) recusa `null`, array, string, `{ type: 'doc' }` sem `content`; (d) recusa 3.001 nós, 300.001 caracteres, profundidade 9, `id` de 37 caracteres, `reference` de 121, bloco com 201 versículos; (e) aceita `EMPTY_DOC`.
- [ ] Ver falhar, implementar, ver passar. Commit `feat(palavras): formato e validação do documento`.

### Task 3: Derivação: estrutura, versículos e tempo de fala

**Files:**
- Create: `apps/api/src/modules/sermons/sermon-derive.ts`
- Create: `apps/api/src/modules/sermons/sermon-example.ts` (o documento de exemplo da Tarefa 2 e o `DerivedSermon` esperado dele, exportados como `EXAMPLE_DOC` e `EXAMPLE_DERIVED`)
- Test: `apps/api/src/modules/sermons/sermon-derive.spec.ts`

**Interfaces — Consumes:** `SermonDoc` (Tarefa 2). **Produces:**

```ts
export const SPEECH_PACE = { wordsPerMinute: 130, pointSeconds: 60, illustrationSeconds: 90, applicationSeconds: 60 } as const;
export type SermonSection = {
  id: string | null;                       // id do Ponto ou do Título de seção; null na Abertura
  kind: 'OPENING' | 'POINT' | 'HEADING';
  title: string;                           // "Abertura"; texto do Ponto sem número; texto do título
  number: number | null;                   // 1, 2, 3… só nos Pontos
  seconds: number;
  minutes: number;                         // Math.max(1, Math.round(seconds / 60))
};
export type DerivedSermon = {
  sections: SermonSection[];
  verses: { id: string; reference: string }[];   // na ordem, sem repetir referência
  baseReference: string | null;                  // a do primeiro bloco verse
  pointCount: number;
  verseRefs: string;                             // referências normalizadas, uma por linha
  estimatedSeconds: number;                      // soma dos seconds das seções
};
export function normalizeSearch(text: string): string;   // NFD sem diacríticos, minúsculas, espaços colapsados
export function countWords(text: string): number;        // pedaços separados por espaço que têm letra ou dígito
export function deriveSermon(doc: SermonDoc): DerivedSermon;
```

Regras: seção nova em cada `point` e em cada `heading` nível 2 (`heading` 3 não abre seção). A Abertura é o que vem antes da primeira seção e só existe se tiver pelo menos um bloco que não seja `privateNote`. Segundos de uma seção = `Math.round(palavras / 130 * 60)` + folgas dos blocos dela. Palavras contadas: texto de `paragraph`, listas, `heading`, `point`, `illustration`, `application` e os `verses[].text` de `verse`; a referência do versículo não conta; `privateNote` não conta. O texto do próprio `point`/`heading` conta na seção que ele abre.

- [ ] Testes com documentos pequenos e valores fechados: (a) um parágrafo de 130 palavras → uma seção `OPENING`, 60 s, 1 min; (b) `point` "A luz chama" + parágrafo de 127 palavras → 130 palavras = 60 s + 60 de folga = 120 s, `number: 1`, `title: 'A luz chama'`; (c) `illustration` soma 90 s e `application` 60 s além das palavras; (d) `privateNote` com 500 palavras não muda nada; (e) `verse` com dois versículos conta as palavras dos dois textos; (f) `heading` 2 "Conclusão" depois dos pontos → seção `HEADING` sem número; `heading` 3 não abre seção; (g) dois `verse` com a mesma referência → `verses` com um item; `baseReference` é a do primeiro; `verseRefs` de "João 8:12" e "Salmos 119:105" = `"joao 8:12\nsalmos 119:105"`; (h) `EMPTY_DOC` e documento só com `privateNote` → `sections: []`, `estimatedSeconds: 0`, `pointCount: 0`, `baseReference: null`; (i) seção de 5 palavras → `minutes: 1`; (j) `deriveSermon(EXAMPLE_DOC)` é igual a `EXAMPLE_DERIVED` (gerado rodando a função uma vez e conferido à mão contra as regras).
- [ ] Ver falhar, implementar, ver passar. Commit `feat(palavras): estrutura, versículos e tempo de fala`.

### Task 4: Casamento por data e hora, e situação

**Files:**
- Create: `apps/api/src/modules/sermons/delivery-match.ts`
- Test: `apps/api/src/modules/sermons/delivery-match.spec.ts`

**Interfaces — Produces:**

```ts
export type MatchService = { id: string; startTime: string };   // cultos de um tenant numa data
export type MatchDelivery = { id: string; startTime: string; createdAt: Date; pinned: boolean; serviceId: string | null };
/** Para cada envio da data, o culto com que fica (ou null = guardado). */
export function matchDeliveries(services: MatchService[], deliveries: MatchDelivery[]): Map<string, string | null>;

export type SermonStatus = 'DRAFT' | 'SENT' | 'PREACHED';
/** date 'AAAA-MM-DD' e startTime 'HH:MM' no fuso timeZone. */
export function deliveryHasPassed(date: string, startTime: string, now: Date, timeZone: string): boolean;
export function sermonStatus(delivery: { date: string; startTime: string } | null, now: Date, timeZone: string): SermonStatus;
```

`matchDeliveries`: (1) envio `pinned` com `serviceId` de um culto da lista fica com ele e o ocupa; `pinned` cujo culto não está na lista → `null`; (2) os demais, por `createdAt` crescente: o candidato é o culto de hora mais próxima da pedida (diferença em minutos; empate → o de hora menor); livre → casa e ocupa; ocupado → `null` (não tenta outro culto).

- [ ] Testes de `matchDeliveries`: um culto às 09:00 e envio para 19:00 → casa; cultos 09:00 e 19:00, envio 19:00 → o das 19:00; envio 14:00 com cultos 09:00 e 19:00 (empate de 5 h) → 09:00; dois envios não `pinned` para o mesmo culto → o de `createdAt` menor casa, o outro `null`; culto ocupado por `pinned` e envio não `pinned` mais próximo dele → `null`, mesmo havendo outro culto livre no dia; sem cultos → todos `null`; envio que estava no culto das 09:00 (não `pinned`) e surge o das 19:00 → muda para o das 19:00.
- [ ] Testes de situação: sem envio → `DRAFT`; `('2026-11-22','19:00')` em `America/Sao_Paulo` com `now = 2026-11-22T21:59:00Z` → `SENT`; com `22:01:00Z` → `PREACHED`; em `America/Manaus` (UTC−4) o limite é `23:00Z`.
- [ ] Ver falhar, implementar (`Intl.DateTimeFormat` com `timeZone`, sem dependência nova), ver passar. Commit `feat(palavras): casamento por data e hora e situação`.

### Task 5: API das palavras (biblioteca e documento)

**Files:**
- Create: `apps/api/src/modules/sermons/dto/sermon.dto.ts`, `sermons.service.ts`, `sermons.controller.ts`, `sermons.module.ts`
- Modify: `apps/api/src/app.module.ts` (registrar `SermonsModule`)
- Test: `apps/api/src/modules/sermons/sermons.spec.ts`, `apps/api/src/modules/sermons/sermons-dto-contract.spec.ts`

**Interfaces — Consumes:** `validateSermonDocument`, `deriveSermon`, `normalizeSearch`, `sermonStatus`. **Produces:**

```ts
export class CreateSermonDto { title?: string }                          // 1–255
export class UpdateSermonDto { title?: string; document?: object; baseRevision?: number }

export interface SermonSummary {
  id: string; title: string; baseReference: string | null; pointCount: number; estimatedSeconds: number;
  status: SermonStatus;
  delivery: { date: string; startTime: string; serviceId: string | null; serviceName: string | null } | null;
  updatedAt: Date;
}
export interface SermonFull extends SermonSummary { document: SermonDoc; revision: number }

class SermonsService {
  list(user: AuthUser, query: { q?: string; status?: SermonStatus }): Promise<{ items: SermonSummary[]; counts: { all: number; draft: number; sent: number; preached: number } }>;
  create(user: AuthUser, dto: CreateSermonDto): Promise<SermonFull>;
  get(user: AuthUser, id: string): Promise<SermonFull>;
  update(user: AuthUser, id: string, dto: UpdateSermonDto): Promise<SermonFull>;
  duplicate(user: AuthUser, id: string): Promise<SermonFull>;     // título "<título> (cópia)", sem envio
  remove(user: AuthUser, id: string): Promise<{ success: true }>;
}
```

Rotas em `admin/tenants/me/sermons` (`AuthGuard('jwt')` + `PermissionsGuard`, classe com `SERMONS:VIEW`, escrita com `SERMONS:EDIT`, mesmo desenho do `WorshipServicesController`): `GET /`, `POST /`, `GET /:id`, `PUT /:id`, `POST /:id/duplicate`, `DELETE /:id`.

Decisões:
- `list` busca as palavras do autor **sem** a coluna `document`, calcula a situação de cada uma (fuso de `Tenant.timezone`) e filtra em memória: `q` normalizado contido em `normalizeSearch(title)` ou em `verseRefs`; `counts` é sobre o resultado da busca, antes do filtro de situação. Ordem: `updatedAt` decrescente.
- `update`: com `document`, valida, compara `baseRevision` (quando vier) com `revision` → diferente = `ConflictException('Esta palavra foi alterada em outra aba. Recarregue para continuar.')`; grava o documento, as colunas derivadas e `revision + 1`. Só `title` não mexe em `revision`. Numa transação, se a palavra tem envio que ainda não passou, atualiza `title` e `estimatedSeconds` do envio (a cópia pública).
- `remove`: numa transação, apaga o envio se ele ainda não passou; envio já passado fica (o `SetNull` solta o `sermonId`); depois apaga a palavra.
- `document` no DTO: `@IsOptional() @IsObject()`; a validação da árvore é feita no serviço por `validateSermonDocument`.

- [ ] Testes (`sermons.spec.ts`, Prisma falso no estilo de `worship-services.spec.ts`): outro usuário do mesmo tenant, **com `role: TENANT_ADMIN`**, chamando `get`/`update`/`duplicate`/`remove` → `NotFoundException` e nenhuma escrita; outro tenant → idem; `list` só devolve as do autor e nunca inclui `document`; `update` com documento grava `baseReference`, `pointCount`, `verseRefs`, `estimatedSeconds` e soma 1 em `revision`; `baseRevision` errado → `ConflictException` e nada escrito; documento inválido → `BadRequestException` e nada escrito; busca "joao" acha a palavra com "João 8:12" e a de título "João e a luz"; salvar o título de uma palavra Enviada atualiza o envio, e de uma Pregada não; apagar Enviada apaga o envio, apagar Pregada não.
- [ ] Testes de contrato (`sermons-dto-contract.spec.ts`, como `worship-dto-contract.spec.ts`): os DTOs recusam `authorId`, `tenantId`, `status`, `revision`, `baseReference`, `estimatedSeconds`; título vazio e de 256 caracteres.
- [ ] Ver falhar, implementar, ver passar; `npx tsc --noEmit -p tsconfig.json`. Commit `feat(palavras): API da biblioteca e do documento`.

### Task 6: API do envio

**Files:**
- Create: `apps/api/src/modules/sermons/dto/delivery.dto.ts`, `sermon-delivery.service.ts`
- Modify: `sermons.controller.ts`, `sermons.module.ts` (provider e `exports: [SermonDeliveryService]`)
- Test: `apps/api/src/modules/sermons/sermon-delivery.spec.ts`

**Interfaces — Consumes:** `matchDeliveries`, `deliveryHasPassed`. **Produces:**

```ts
export class SendSermonDto { serviceId?: string; date?: string; startTime?: string; replace?: boolean }  // serviceId OU (date E startTime)
export class DeliveryPreviewQuery { date!: string; startTime!: string }

type Tx = Prisma.TransactionClient;
class SermonDeliveryService {
  serviceOptions(user: AuthUser): Promise<{ id: string; date: string; startTime: string; name: string; hasSermon: boolean; isMine: boolean }[]>;
  preview(tenantId: string, date: string, startTime: string): Promise<{ service: { id: string; date: string; startTime: string; name: string } | null; occupied: boolean }>;
  send(user: AuthUser, sermonId: string, dto: SendSermonDto): Promise<SermonFull>;
  cancel(user: AuthUser, sermonId: string): Promise<SermonFull>;
  /** Para o módulo worship. */
  rematch(tx: Tx, tenantId: string, dates: string[]): Promise<void>;
  followService(tx: Tx, tenantId: string, service: { id: string; date: string; startTime: string }): Promise<void>;  // o envio pinned copia a data e a hora do culto
  releaseService(tx: Tx, tenantId: string, serviceId: string): Promise<void>;                                         // o envio do culto vira pinned: false, serviceId: null
  summaries(tenantId: string, serviceIds: string[]): Promise<Map<string, { title: string; preacherName: string; estimatedMinutes: number }>>;
}
```

Rotas novas no controller, **declaradas antes de `/:id`**: `GET /service-options`, `GET /delivery-preview`, `PUT /:id/delivery`, `DELETE /:id/delivery`.

Decisões:
- `serviceOptions`: cultos do tenant com `date` ≥ hoje no fuso do tenant, por data e hora, até 8.
- `send`, numa transação: a palavra tem de ser do autor (senão 404). O envio da palavra é criado ou movido (`sermonId` é único), com `title`, `preacherName` (`AdminUser.name`, ou o e-mail se não houver nome) e `estimatedSeconds` copiados.
  - Com `serviceId`: o culto tem de ser do tenant (senão 404). Se já tem envio de **outra** palavra: sem `replace` → `ConflictException` com corpo `{ code: 'SERVICE_HAS_SERMON', message: 'Este culto já tem uma palavra.' }`; com `replace` → apaga o outro envio. Grava `pinned: true` e a data e a hora do culto.
  - Com `date` + `startTime`: grava `pinned: false`, `serviceId: null`, e roda `rematch` na data. Se depois disso o envio ficou guardado **e** `preview` diz que o culto mais próximo está ocupado: sem `replace` → 409 igual (a transação é desfeita); com `replace` → apaga o envio que ocupa aquele culto e grava este com `serviceId` dele e `pinned: true`.
  - Ao mover um envio, roda `rematch` também na data antiga.
  - Corpo sem `serviceId` e sem o par `date`/`startTime`, ou com os dois → 400 "Escolha um culto ou informe a data e a hora."
- `rematch`: para cada data, lê os cultos e os envios do tenant naquela data, chama `matchDeliveries` e grava só os `serviceId` que mudaram.

- [ ] Testes: enviar para culto da lista → `pinned`, data e hora do culto, situação `SENT`; culto de outro tenant → 404; palavra de outro autor → 404; culto com palavra de outro → 409 `SERVICE_HAS_SERMON` e nada escrito; com `replace` → o envio antigo some e a palavra dele volta a `DRAFT`; reenviar a mesma palavra para outro culto move (continua um envio só) e roda `rematch` na data antiga; "Outra data" sem culto → guardada, `serviceId: null`; "Outra data" com um culto livre no dia → casa na hora; `cancel` apaga o envio; `followService` muda a data do envio `pinned` e não a do não `pinned`; `releaseService` + `rematch` devolve o envio à disputa; `summaries` devolve só `title`, `preacherName`, `estimatedMinutes` (arredondado para cima); corpo com `serviceId` e `date` juntos → 400; DTO recusa `pinned`, `authorId`, `title`.
- [ ] Ver falhar, implementar, ver passar. Commit `feat(palavras): envio para um culto`.

### Task 7: Ligação com o roteiro (módulo `worship`)

**Files:**
- Modify: `apps/api/src/modules/worship/worship.module.ts` (`imports` + `SermonsModule`)
- Modify: `apps/api/src/modules/worship/worship-services.service.ts`
- Modify: `apps/api/src/modules/worship/worship-services.spec.ts`

**Interfaces — Consumes:** `SermonDeliveryService.rematch`, `followService`, `releaseService`, `summaries`.

Mudanças no `WorshipServicesService` (recebe `SermonDeliveryService` no construtor):
- `create`, `update` e `remove` passam a rodar dentro de `this.prisma.$transaction(async (tx) => …)`:
  - `create`: cria o culto, depois `rematch(tx, tenantId, [date])`.
  - `update`: se `date` ou `startTime` mudou → `followService(tx, …)` e `rematch(tx, tenantId, [dataAntiga, dataNova])`.
  - `remove`: `releaseService(tx, …)`, apaga o culto, `rematch(tx, tenantId, [date])`.
- `get` devolve também `sermon: { title, preacherName, estimatedMinutes } | null` (o `slideCount` da spec entra na etapa 3, com os slides); `list` devolve `hasSermon` em cada item. Os dois via `summaries`, lendo só `sermon_deliveries`.

O `$transaction` do Prisma falso do spec existente recebe um array; passa a aceitar também a forma de função (`typeof arg === 'function' ? arg(prisma) : Promise.all(arg)`).

- [ ] Testes novos no spec: criar um culto chama `rematch` com a data dele, dentro da transação; mudar a data chama `followService` e `rematch` com as duas datas; mudar só o nome não chama nenhum dos dois; apagar chama `releaseService` antes do `delete` e `rematch` depois; `get` de um culto com envio traz `sermon` com exatamente as três chaves; sem envio, `sermon: null`.
- [ ] Um teste de ponta a ponta com os serviços reais e um Prisma falso em memória para `worshipService` e `sermonDelivery`: envio para "Outra data" 06/12 19:00 sem culto → guardado; criar o culto de 06/12 19:00 → o envio passa a ter o `serviceId` dele; apagar o culto → o envio volta a `serviceId: null`.
- [ ] `npm test && npx tsc --noEmit -p tsconfig.json && npm run build` → exit 0. Commit `feat(palavras): a palavra entra no roteiro do culto`.

### Task 8: Painel: cliente, derivação, rota, menu e lista

**Files:**
- Create: `apps/admin/src/features/sermons/api/sermons-api.ts` (tipos da Tarefa 5 e 6; funções `listSermons`, `createSermon`, `getSermon`, `updateSermon`, `duplicateSermon`, `deleteSermon`, `listServiceOptions`, `previewDelivery`, `sendSermon`, `cancelDelivery`; corpo montado campo a campo)
- Create: `apps/admin/src/features/sermons/lib/document.ts` (cópia dos tipos da Tarefa 2 e de `deriveSermon`, `countWords`, `normalizeSearch`, `SPEECH_PACE` da Tarefa 3), `lib/sermon-example.ts` (cópia idêntica de `EXAMPLE_DOC` e `EXAMPLE_DERIVED`), `lib/format.ts` (`formatSituation(summary): string`, `formatSpeech(seconds): string`, `formatBase(summary): string`)
- Create: `apps/admin/src/features/sermons/pages/SermonsListPage.tsx`, `components/SituationLabel.tsx`
- Modify: `apps/admin/src/routes/AppRoutes.tsx`, `apps/admin/src/components/layout/AppSidebar.tsx`
- Test: `lib/document.test.ts`, `lib/format.test.ts`, `pages/SermonsListPage.test.tsx`, `apps/admin/src/routes/AppRoutes.test.tsx`

Decisões:
- Menu: item **Palavras** logo depois de **Cultos**, ícone `BookOpen`, `url: "/palavras"`, `modules: ["SERMONS"]`.
- Rotas: `PermissionRoute module="SERMONS"` com `/palavras` (lista, dentro do layout com menu) e `/palavras/:id` (editor, fora do layout com menu, do mesmo jeito que `/cultos/musicas/:id`; componente carregado com `React.lazy`).
- Lista como no desenho `PalavraLista`: título "Palavras"; "Nova palavra" (some sem `EDIT`; cria e navega para o editor); busca com `placeholder="Título ou versículo"` e `aria-label="Procurar palavra"`, com 300 ms de espera; filtro Todas / Rascunhos / Enviadas / Pregadas; cada linha leva ao editor.
- Textos: `formatBase` → `"João 8:12 · 3 pontos"`, `"João 8:12 · 1 ponto"`, `"João 8:12 · sem pontos ainda"`, `"3 pontos"` (sem versículo), `"sem pontos ainda"`. `formatSituation` → `"Rascunho"`, `"Enviada · dom 22/11, 19h"` (minutos só quando não são zero: `"19h30"`), `"Pregada · dom 15/11"`. `formatSpeech(1680)` → `"28 min de fala"`; menos de 60 s → `"menos de 1 min de fala"`.
- Lista vazia sem busca: "Você ainda não escreveu nenhuma palavra." com o botão; vazia com busca: "Nenhuma palavra encontrada."

- [ ] Testes: `deriveSermon(EXAMPLE_DOC)` igual a `EXAMPLE_DERIVED` (o mesmo par da API; se um lado mudar, o outro quebra); os textos de `format` acima; a lista mostra título, base e situação, filtra por situação, esconde "Nova palavra" sem `EDIT`, mostra os dois estados vazios; `/palavras` sem `SERMONS` cai na tela de sem permissão e o item some do menu.
- [ ] Ver falhar, implementar, ver passar; `npx tsc --noEmit -p tsconfig.app.json && npm run lint`. Commit `feat(palavras): menu, rota e lista do pregador`.

### Task 9: Painel: o editor e os cinco blocos

**Files:**
- Modify: `apps/admin/package.json` (as três dependências do Tiptap, versão exata)
- Create: `apps/admin/src/features/sermons/editor/extensions.ts` (`sermonExtensions`: `StarterKit` com `heading.levels: [2, 3]` e sem `blockquote`, `code`, `codeBlock`, `strike`, `horizontalRule`; os nós `point`, `verse`, `illustration`, `application`, `privateNote`; a extensão `UniqueBlockId`)
- Create: `editor/blocks/PointView.tsx`, `VerseView.tsx`, `CalloutView.tsx` (Ilustração, Aplicação e "Só para mim" são o mesmo componente com variação), `editor/block-colors.ts`
- Create: `editor/SermonToolbar.tsx`, `editor/VerseDialog.tsx`, `editor/SermonSheet.tsx`
- Test: `editor/extensions.test.ts`, `editor/VerseDialog.test.tsx`

**Interfaces — Produces:**

```ts
export const sermonExtensions: Extensions;
// comandos registrados: editor.commands.insertPoint(), insertVerse(attrs: Omit<VerseAttrs, 'id'>), updateVerse(id, attrs),
//                       insertCallout(kind: 'illustration' | 'application' | 'privateNote')
// SermonSheet: props { title: string; document: SermonDoc; editable: boolean;
//                      onTitleChange(title: string): void; onDocumentChange(doc: SermonDoc): void; onEditor(editor: Editor): void }
```

Decisões:
- Esquema dos nós igual ao da spec: `point` (`content: 'inline*'`, atributo `id`), `verse` (`atom: true`, sem conteúdo editável, atributos de `VerseAttrs`), `illustration`/`application`/`privateNote` (`content: '(paragraph | bulletList | orderedList)+'`, atributo `id`). `heading` ganha o atributo `id`.
- `UniqueBlockId`: `appendTransaction` que, depois de qualquer mudança de documento, dá `crypto.randomUUID()` a todo nó `heading`, `point`, `verse`, `illustration`, `application`, `privateNote` sem `id` ou com `id` que já apareceu antes no documento.
- O número do Ponto ("1.", "2.") é desenhado pelo `PointView` contando os `point` anteriores; não é texto do documento.
- Barra de ferramentas (`role="toolbar"`, `aria-label="Formatação e blocos do sermão"`): menu **Texto** (Texto normal, Título de seção, Subtítulo), **Negrito** (`aria-label`), **Itálico**, **Lista**, separador, e os cinco botões na ordem do desenho: Versículo, Ponto, Ilustração, Aplicação, Só para mim, cada um com o quadradinho de cor de `block-colors.ts` (cores do desenho). Botão ativo marcado com `aria-pressed`.
- Aparência dos blocos como no desenho `Palavra`: Versículo em caixa roxa clara com o texto e a referência em negrito abaixo; Ilustração verde e Aplicação laranja com a etiqueta em maiúsculas; "Só para mim" cinza com o cadeado.
- **Versículo, nesta etapa, é digitado à mão.** O botão abre o `VerseDialog` ("Inserir versículo"): campo **Referência** (obrigatório, até 120, `placeholder="João 3:16"`) e **Texto** (obrigatório); "Inserir". Grava `{ reference, book: null, chapter: null, verseStart: null, verseEnd: null, translation: null, verses: [{ number: null, text }] }`. Clicar num Versículo já inserido abre o mesmo diálogo para alterar ou remover. A busca na Bíblia é a etapa 2.
- `SermonSheet`: a folha (largura máxima 780 px, sombra leve, fonte 17 px) com o campo de título grande no topo (`aria-label="Título da palavra"`, Enter leva o cursor ao documento) e o `EditorContent`. Colar: `transformPastedHTML` padrão do Tiptap; o esquema descarta o que não conhece.

- [ ] Testes de `extensions.test.ts` com `new Editor({ extensions: sermonExtensions, content })` do `@tiptap/core` (sem montar React): `insertPoint` cria `point` com `id`; `insertVerse` cria o nó com os atributos; `insertCallout('privateNote')` cria o bloco com um parágrafo dentro; carregar um documento com dois `point` de mesmo `id` deixa os dois com `id` diferentes depois da primeira transação; `editor.getJSON()` depois de carregar `EXAMPLE_DOC` é igual a `EXAMPLE_DOC` (o formato não muda na ida e volta); `setContent` com HTML contendo `<img>` e `<h1>` não produz nó `image` nem `heading` nível 1.
- [ ] Testes de `VerseDialog`: "Inserir" desligado sem referência ou sem texto; envia `reference` e `text` aparados; em modo de alteração mostra "Remover".
- [ ] Ver falhar, implementar, ver passar; `npx tsc --noEmit -p tsconfig.app.json && npm run lint && npm run build`. Commit `feat(palavras): editor do sermão com os cinco blocos`.

### Task 10: Painel: página do editor, estrutura, tempo de fala e salvamento

**Files:**
- Create: `apps/admin/src/features/sermons/pages/SermonEditorPage.tsx`, `components/StructurePanel.tsx`, `lib/use-autosave.ts`
- Test: `lib/use-autosave.test.ts`, `components/StructurePanel.test.tsx`

**Interfaces — Consumes:** `SermonSheet`, `deriveSermon`, `formatSpeech`, `updateSermon`. **Produces:**

```ts
export type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';
export function useAutosave(args: {
  sermonId: string; initialRevision: number;
  save(body: { title?: string; document?: SermonDoc; baseRevision?: number }): Promise<{ revision: number }>;
  delayMs?: number;                                   // 1500
}): { state: SaveState; setTitle(title: string): void; setDocument(doc: SermonDoc): void; flush(): Promise<void>; retry(): void };
```

Decisões:
- Barra de cima como no desenho: voltar (`aria-label="Voltar para Palavras"`, faz `flush` antes de sair), o título, o estado do salvamento, a pílula do tempo de fala (`formatSpeech`), o menu "…" (Duplicar; Apagar, com confirmação: "Apagar esta palavra?" e, se está enviada e não pregada, "Ela também sai do culto de dom 22/11, 19h."), e o botão **Enviar para um culto** (Tarefa 11). "Exportar" e "Gerar slides" não aparecem nesta etapa.
- Textos do estado: `saving` "Salvando…"; `saved` "Salvo"; `error` "Não foi possível salvar." com o botão "Tentar de novo"; `conflict` "Esta palavra foi alterada em outra aba." com "Recarregar".
- `useAutosave`: junta as mudanças e salva 1,5 s depois da última; manda só o que mudou (`title` e/ou `document`), e `baseRevision` quando manda `document`; guarda a `revision` devolvida. Uma chamada por vez: mudança durante um salvamento espera ele terminar e salva de novo. Erro de rede → `error`, mantém o que está pendente, **não** tenta de novo sozinho. 409 → `conflict` e para de salvar até recarregar. `beforeunload` avisa se há mudança pendente.
- `StructurePanel` (`aria-label="Estrutura do sermão"`): título "Estrutura"; uma linha por seção com o nome ("Abertura", "1. A luz chama", "Conclusão") e `"8 min"`; a seção do cursor destacada; clicar rola a folha até o bloco (`id`). Abaixo, `"Versículos · 3"` e as referências. Sem seções: "A estrutura aparece conforme você escreve." Recalcula com `deriveSermon` a cada mudança do documento, sem ir ao servidor. Abaixo de 1024 px vira um botão "Estrutura" que abre uma gaveta (`Sheet` do shadcn).
- Sem `SERMONS:EDIT`: editor `editable: false`, sem barra de ferramentas, sem salvamento.
- Palavra que não existe ou não é do usuário (404): "Palavra não encontrada." com link para a lista.

- [ ] Testes de `useAutosave` (timers falsos): duas mudanças em 1 s → uma chamada, 1,5 s depois da segunda, com `baseRevision` inicial; a chamada seguinte usa a `revision` devolvida; mudança durante o salvamento gera uma segunda chamada depois da primeira, nunca duas ao mesmo tempo; `save` rejeita → `error`, e `retry` reenvia o mesmo corpo; `save` rejeita com status 409 → `conflict` e nenhuma chamada nova depois de outra mudança; mudar só o título não manda `document` nem `baseRevision`; `flush` salva na hora o que está pendente.
- [ ] Testes de `StructurePanel`: com `EXAMPLE_DERIVED` mostra as seções, os minutos e os versículos do exemplo; vazio mostra o texto de vazio; clicar chama `onSelect(id)`.
- [ ] Ver falhar, implementar, ver passar; `npx tsc --noEmit -p tsconfig.app.json && npm run lint`. Commit `feat(palavras): estrutura, tempo de fala e salvamento automático`.

### Task 11: Painel: enviar para um culto, e a palavra no roteiro

**Files:**
- Create: `apps/admin/src/features/sermons/components/SendToServiceDialog.tsx`
- Modify: `apps/admin/src/features/sermons/pages/SermonEditorPage.tsx`
- Modify: `apps/admin/src/features/worship/api/worship-api.ts` (tipo `sermon` no culto, `hasSermon` na lista), `apps/admin/src/features/worship/components/service/MomentsTab.tsx`
- Test: `components/SendToServiceDialog.test.tsx`, `apps/admin/src/features/worship/components/service/MomentsTab.test.tsx`

Decisões (desenho `PalavraCulto`):
- Título "Enviar para um culto"; abaixo, o título da palavra.
- Grupo de rádio `aria-label="Qual culto"` com os cultos de `listServiceOptions`: primeira linha `"Domingo, 22/11 · 19h"`, segunda o nome do culto, com `" · já tem uma palavra"` quando `hasSermon && !isMine` e `" · esta palavra"` quando é o envio atual. Sem cultos: "Nenhum culto criado ainda."
- Opção **Outra data** com `<input type="date" aria-label="Data">` e `<input type="time" aria-label="Hora">` (hora inicial 19:00). Com os dois preenchidos, chama `previewDelivery` (300 ms de espera) e mostra: culto livre → "Entra no culto de domingo, 06/12 · 19h."; sem culto → "Ainda não há culto nesse dia. A palavra fica guardada e entra sozinha quando ele for criado."; culto ocupado → "O culto de domingo, 06/12 · 19h já tem uma palavra."
- **Enviar** (desligado sem escolha). Resposta 409 `SERVICE_HAS_SERMON` → `AlertDialog` "Este culto já tem uma palavra. Trocar?" com "Trocar" (reenvia com `replace: true`) e "Cancelar". Sucesso → `toast` "Palavra enviada." e volta para `/palavras`.
- Palavra já enviada: o botão da barra de cima vira "Enviada · dom 22/11, 19h" e abre o mesmo diálogo, que ganha "Cancelar o envio" (confirma; a palavra volta a Rascunho).
- O diálogo faz `flush` do salvamento antes de enviar, para a cópia levar o título atual.
- **No roteiro:** o momento de tipo `SERMON` mostra, quando o culto tem `sermon`, a etiqueta roxa clara com o ícone de livro e o título (como no desenho `Roteiro`), com `title` "Palavra de <preacherName>"; a duração do momento passa a mostrar "40 min · palavra estimada em 28" (a duração planejada não muda). Sem `sermon`, nada. Culto com `sermon` e sem momento `SERMON`: aviso acima da lista "Este culto tem uma palavra, mas o roteiro não tem o momento Palavra." com o botão "Adicionar o momento Palavra" (acrescenta `{ name: 'Palavra', kind: 'SERMON', durationMinutes: 40 }` no fim). A etiqueta não é link nesta etapa; a prévia dos slides é a etapa 3.

- [ ] Testes do diálogo: lista os cultos com os textos acima; escolher um e enviar chama `sendSermon(id, { serviceId })`; "Outra data" chama `sendSermon(id, { date, startTime })` e mostra cada um dos três textos do `previewDelivery`; 409 abre a confirmação e "Trocar" reenvia com `replace: true`; "Cancelar o envio" só aparece para palavra enviada.
- [ ] Testes do roteiro: momento `SERMON` com `sermon` mostra o título; sem `sermon` não mostra; culto com `sermon` e sem momento `SERMON` mostra o aviso, e o botão chama o salvamento com o momento novo no fim.
- [ ] Ver falhar, implementar, ver passar. Commit `feat(palavras): enviar para um culto e a palavra no roteiro`.

### Task 12: Gates e conferência no navegador

- [ ] API: `cd apps/api && npm ci && npx prisma generate && npx tsc --noEmit -p tsconfig.json && npm test && npm run build` → exit 0.
- [ ] Admin: `cd apps/admin && npm ci && npx tsc --noEmit -p tsconfig.app.json && npm run lint && npx vitest run && npm run build` → exit 0 (sem erro de lint; avisos tolerados).
- [ ] Subir local (`README.md`) e conferir no navegador, com dois usuários do mesmo tenant (um pregador com o grupo Pregadores, um administrador):
  1. O pregador cria uma palavra, escreve com os cinco blocos, vê a estrutura e o tempo de fala mudarem, recarrega a página e o texto está lá.
  2. Envia para um culto existente; a lista mostra "Enviada · …"; o roteiro daquele culto mostra o título no momento Palavra.
  3. Envia outra palavra para "Outra data" sem culto; cria o culto naquela data pelo Roteiro; a palavra aparece nele sem mais nada.
  4. Envia uma terceira para o culto que já tem palavra; confirma a troca; a primeira volta a Rascunho.
  5. O administrador abre `/palavras` e **não** vê as palavras do pregador; a URL direta de uma delas mostra "Palavra não encontrada."
  6. Abre a mesma palavra em duas abas, edita nas duas: a segunda mostra o aviso de outra aba e não sobrescreve.
- [ ] **Calibrar o tempo de fala:** pedir ao usuário um ou dois sermões reais com a duração conhecida, escrever cada um no editor e comparar com a estimativa. Se a diferença passar de 20%, propor ao usuário os novos valores de `SPEECH_PACE` (API e painel) antes de mudar.
- [ ] Inspecionar o diff inteiro da branch contra a `qa`; corrigir o que aparecer; rodar os gates de novo.
- [ ] Avisar o usuário para validar; não fazer merge na `qa` sem ele pedir.
