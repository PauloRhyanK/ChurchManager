# Cultos: Músicas e Roteiro (etapa 1) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A equipe de louvor monta músicas (letra em partes, tempo por slide, clima por parte, áudio-guia) e roteiriza cultos dentro do ChurchManager.

**Architecture:** Módulo Nest novo `worship` (Prisma, rotas `admin/tenants/me/worship/*`, permissão `WORSHIP`). A música guarda a letra montada num JSON de linhas planas (`rows`); partes, slides e situação são derivados por funções puras, duplicadas na API e no painel. O painel ganha `features/worship` com lista, criação, editor em 4 passos e roteiro.

**Tech Stack:** NestJS 10 + Prisma + class-validator + `node:test`; React 18 + Vite + shadcn/ui + TanStack Query + dnd-kit + vitest.

**Spec:** `docs/superpowers/specs/2026-11-19-cultos-musicas-roteiro-design.md`

## Global Constraints

- Gates do `AGENTS.md` com exit 0 (API e admin). A API não tem ESLint.
- Tenant sempre do JWT. Id de outro tenant → 404 sem escrever.
- DTO com whitelist + `forbidNonWhitelisted`; não aceitar campo que o servidor devolve.
- Corpo de escrita montado campo a campo no painel.
- Textos e mensagens em pt-BR. Nada de "IA" na interface: "Organizada automaticamente", "Sugestão automática".
- Não tocar em `apps/ponte`. Nenhum segredo no repositório. Nenhuma dependência nova.
- Não fazer push na `main` nem merge na `qa`.
- Limites: 600 linhas por música; `text` 200; `time` 0–3600; áudio 90 MB; MP3, WAV, M4A/AAC, OGG, FLAC pela assinatura dos bytes.

## Review Focus

1. Letra colada com `\r\n`, tabs, linhas só de espaço e linha maior que 200 caracteres → organiza sem erro; linha longa é quebrada pelo formatador (teste na Tarefa 2).
2. Documento sem nenhuma linha `lyric` (só instruções) ou vazio → derivação devolve partes/slides coerentes, situação `DRAFT` quando não há slide (Tarefa 3).
3. Tempos fora de ordem ou além da duração do áudio → `pending` inclui `TIMES`, e marcar como pronta responde 400 (Tarefa 3 e 4).
4. Colar texto rico ou apagar a seleção inteira no editor → o DOM lido de volta vira linhas válidas, com ids únicos e a primeira linha abrindo parte (Tarefa 8).
5. Arquivo que não é áudio com extensão `.mp3`, e áudio acima de 90 MB → 400 e 413 em pt-BR (Tarefa 5).

---

### Task 1: Schema, migração e permissão `WORSHIP`

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (enum `PermissionModule` + `WORSHIP`; enums `WorshipSongStatus`, `WorshipMomentKind`; modelos `WorshipSong`, `WorshipServiceTemplate`, `WorshipService`, `WorshipServiceMoment`, `WorshipServiceSong`; relações em `Tenant`)
- Create: `apps/api/prisma/migrations/20261119120000_add_worship/migration.sql`
- Modify: `apps/api/src/modules/access/permissions.ts` (`PERMISSION_MODULES`)
- Modify: `apps/admin/src/lib/auth-storage.ts`, `apps/admin/src/features/access/permissions.ts` (módulo "Cultos" + modelo de grupo "Equipe de louvor")

Campos exatamente como na seção "Modelo de dados" da spec. `WorshipServiceSong.songId` com `onDelete: Restrict`.

- [ ] Editar o schema; escrever a migração à mão (`ALTER TYPE "PermissionModule" ADD VALUE 'WORSHIP'` + `CREATE TYPE`/`CREATE TABLE`), conferindo com `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url …` que não sobra diferença.
- [ ] `npx prisma generate && npx tsc --noEmit -p tsconfig.json` → exit 0; `npm test` (os testes de permissão existentes continuam verdes).
- [ ] Commit `feat(cultos): schema, migração e permissão WORSHIP`.

### Task 2: Organizador da letra (porte do `letras.html`)

**Files:**
- Create: `apps/api/src/modules/worship/lyrics-format.ts` — `splitPhrase(words: string[], maxC: number): string[][]` e `formatLyrics(input: string, opt?): { slides: { pre: string[]; lines: string[]; post: string[] }[] }`, porte linha a linha do script de `apps/ponte/pc/letras.html` (mesmas listas `FUNC`/`WEAK_END`, mesmo custo), com `upper: false` por padrão.
- Create: `apps/api/src/modules/worship/lyrics-organizer.ts` — `organizeLyrics(raw: string): WorshipRow[]`
- Create: `apps/api/src/modules/worship/worship-document.ts` (só os tipos nesta tarefa: `WorshipRow`, `PartKind`, `Mood`, `CueTarget` e as listas `PART_KINDS`, `MOODS`, `CUE_TARGETS`)
- Test: `apps/api/src/modules/worship/lyrics-organizer.spec.ts`

**Interfaces — Produces:** `organizeLyrics(raw) → WorshipRow[]` com ids `randomUUID()`, a primeira linha com `part`, `break` entre slides, sem `time`.

Regras (spec, "Regras da organização"): estrofes por linha em branco; cabeçalho reconhecido por `/^\[?\s*(refr[aã]o|coro|verso|estrofe|ponte|intro(?:du[cç][aã]o)?|pr[eé][- ]?refr[aã]o|instrumental|final)\s*\d*\s*\]?\s*:?$/i`; estrofe repetida (texto normalizado: minúsculas, sem acento nem pontuação) → `CHORUS`; `//` no começo da estrofe ou no meio → `cue` antes do slide seguinte; destinatário pelo prefixo; clima por `suggestMood(kinds: PartKind[]): Mood[]` (exportada, usada também pelo painel via cópia).

- [ ] Testes: (a) o `EXEMPLO` do `letras.html` gera os mesmos textos de slide que o original (valores esperados copiados rodando o script original em Node uma vez); (b) estrofe repetida vira `CHORUS`, as outras `VERSE`; (c) `[Ponte]` e `Refrão:` definem o tipo e somem; (d) `//Solo: voz masculina` → `{type:'cue', target:'VOCAL', text:'voz masculina'}`, `//cai a canção` → `ALL`; (e) `(2x)` duplica; (f) `\r\n`, tabs e linha de 300 caracteres não quebram e nenhuma linha passa de 200; (g) último de dois refrões recebe `EXPLOSION`.
- [ ] Ver falhar, implementar, ver passar. Commit `feat(cultos): organizador da letra por regra`.

### Task 3: Derivação do documento e situação

**Files:**
- Modify: `apps/api/src/modules/worship/worship-document.ts`
- Test: `apps/api/src/modules/worship/worship-document.spec.ts`

**Interfaces — Produces:**
```ts
normalizeRows(rows: WorshipRow[]): WorshipRow[] // 1ª linha abre parte (VERSE por padrão), tira break duplicado/nas pontas, limpa time fora de início de slide, ids únicos
deriveSong(rows: WorshipRow[]): { parts: DerivedPart[]; slides: DerivedSlide[] }
// DerivedPart { index, kind, name, mood, time, firstSlide, slideCount }
// DerivedSlide { index, part, rowId, time, timeSource, lines: string[] (maiúsculas pt-BR), cues: {target,text}[] }
songPending(rows, audio: { url: string | null; durationSeconds: number | null }): Pending[] // 'AUDIO' | 'TIMES' | 'MOODS' (sem 'CONFIRM')
songStatus(rows, audio, readyAt: Date | null): { status: WorshipSongStatus; pending: Pending[] } // acrescenta 'CONFIRM' quando completo e não marcado
holyricsText(rows): string
```
Nome da parte: `Verso N` numerado; `Refrão`, `Ponte`, `Intro`, `Pré-refrão`, `Instrumental`, `Final`. `TIMES` pendente quando algum slide não tem tempo, os tempos não são estritamente crescentes, ou algum passa da duração.

- [ ] Testes cobrindo: slide só com `cue`; documento vazio → `DRAFT`; tempos fora de ordem → `TIMES`; completo sem `readyAt` → `NEEDS_TIMING` com `['CONFIRM']`; completo com `readyAt` → `READY`; `holyricsText` com `//Vocal: …` antes das linhas em maiúsculas.
- [ ] Implementar, ver passar. Commit.

### Task 4: Músicas — DTOs, serviço, controller

**Files:**
- Create: `apps/api/src/modules/worship/dto/{create-song,update-song,organize-song,song-row,upload-audio}.dto.ts`
- Create: `apps/api/src/modules/worship/worship-songs.service.ts`, `worship-songs.controller.ts`, `worship.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `worship-songs.spec.ts` (isolamento + regras), `worship-dto-contract.spec.ts`

`SongRowDto`: `id` (string ≤36), `type` (`IsIn`), `text?` (≤200), `target?` (`IsIn`), `part?` (`ValidateNested` → `kind`, `mood` anulável), `time?` (0–3600, anulável), `timeSource?`. `UpdateSongDto.rows`: `@IsArray @ArrayMaxSize(600) @ValidateNested({each:true}) @Type(() => SongRowDto)`.

Serviço (`WorshipSongsService`): `list(tenantId, {q, status})`, `get`, `create`, `update`, `organize`, `setAudio(tenantId, id, file, durationSeconds)`, `removeAudio`, `markReady`, `unmarkReady`, `remove`. Toda escrita passa por `normalizeRows` e regrava `status`/`readyAt` com `songStatus`. `markReady` com pendência além de `CONFIRM` → `BadRequestException('Ainda falta: …')` em pt-BR. `remove` com música em roteiro → `ConflictException('Esta música está em um roteiro. Tire-a do roteiro antes de apagar.')`. Resposta sempre via `toSongResponse` (inclui `status`, `pending`, `slideCount`).

- [ ] Testes com Prisma falso (padrão de `church-isolation.spec.ts`): outro tenant → 404 e nenhuma escrita em `update`, `organize`, `markReady`, `remove`; `markReady` incompleta → 400; edição que quebra música pronta zera `readyAt`; contrato do DTO recusa `status`, `audioUrl`, `tenantId` e linha com `type` inválido.
- [ ] Implementar; `npx tsc --noEmit && npm test`. Commit.

### Task 5: Áudio no `StorageService`

**Files:**
- Modify: `apps/api/src/modules/storage/storage.service.ts` — extrair `private putObject(key, body, contentType, failMessage)`; `detectAudioType(buf): { mime; extension } | null`; `MAX_AUDIO_BYTES = 90 * 1024 * 1024`; `uploadAudio(buffer, folder): Promise<{ url: string; sizeBytes: number }>`
- Create: `apps/api/src/modules/storage/audio-upload.interceptor.ts`
- Test: acrescentar em `storage.service.spec.ts`

Assinaturas: WAV `RIFF….WAVE`; MP3 `ID3` ou sync `0xFF` + `(b1 & 0xE0) === 0xE0`; OGG `OggS`; FLAC `fLaC`; M4A `ftyp` no offset 4. Mensagens: `'Formato não aceito. Envie um áudio MP3, WAV, M4A, OGG ou FLAC.'`, `'O áudio excede o limite de 90 MB.'`.

- [ ] Testes: cada assinatura reconhecida; PNG renomeado → `null`/400; `uploadImage` inalterado (testes existentes verdes).
- [ ] Ligar em `POST /songs/:id/audio` e `DELETE /songs/:id/audio`. Commit.

### Task 6: Roteiro — modelos, cultos, momentos, músicas

**Files:**
- Create: `apps/api/src/modules/worship/service-schedule.ts` — `DEFAULT_TEMPLATE`, `computeSchedule(startTime: string, moments, songDurations: (number|null)[]): { moments: (Moment & { startsAt: string; effectiveMinutes: number })[]; endsAt: string }`
- Create: `dto/{create-service,update-service,set-moments,set-songs,create-template}.dto.ts`, `worship-services.service.ts`, `worship-services.controller.ts`, `worship-templates.controller.ts`
- Test: `service-schedule.spec.ts`, `worship-services.spec.ts`

- [ ] Testes: modelo padrão às 19:00 → Pré-culto 18:45, Abertura 19:00, Louvor 19:05, Avisos 19:22, …, `endsAt` 20:17; louvor com 3 músicas de 200 s → 10 min; uma música sem áudio → usa `durationMinutes`; `setSongs` com id de outro tenant → 400; culto de outro tenant → 404.
- [ ] Implementar (`setMoments`/`setSongs` em transação: apaga e recria na ordem, preservando `id` quando veio). Commit.

### Task 7: Painel — API, lista, menu, rotas, Nova música

**Files:**
- Create: `apps/admin/src/features/worship/api/worship-api.ts` (tipos + chamadas, corpos montados campo a campo)
- Create: `apps/admin/src/features/worship/lib/{document.ts,labels.ts,format.ts}` — cópia de `deriveSong`/`holyricsText`/`suggestMood`/nomes; `SITUATION` (rótulo e cor), `MOOD_META` (nome, cor, texto do desenho), `CUE_TARGET_LABEL`, `formatClock(seconds)`
- Create: `pages/SongsListPage.tsx`, `pages/NewSongPage.tsx`, `components/OrganizingScreen.tsx`, `components/AudioDropField.tsx`
- Modify: `components/layout/AppSidebar.tsx` (Cultos com sub-itens), `routes/AppRoutes.tsx`
- Test: `lib/document.test.ts`, `pages/SongsListPage.test.tsx`, caso novo em `routes/AppRoutes.test.tsx`

Rotas: `/cultos` → redireciona para `/cultos/musicas`; `/cultos/musicas`, `/cultos/musicas/nova` (EDIT), `/cultos/musicas/:id`, `/cultos/roteiro`.

`OrganizingScreen` recebe `steps: { label: string; run: () => Promise<void> }[]` e mostra cada passo por no mínimo 350 ms; passos: "Lendo a letra", "Separando versos e refrão", "Montando os slides", "Sugerindo o clima de cada parte" e, com arquivo, "Enviando o áudio".

- [ ] Testes: lista mostra situação e ficha ("Só a letra" sem tom/bpm/áudio); filtro Pendentes; sem `WORSHIP` a rota redireciona.
- [ ] Implementar; `tsc`, `lint`, `vitest run`. Commit.

### Task 8: Editor — casca e passo 1 (Letra)

**Files:**
- Create: `pages/SongEditorPage.tsx` (carrega, autosave com debounce de 800 ms, trilha de passos, ficha), `components/editor/{StepTrail,SaveIndicator,SongInfoDialog}.tsx`
- Create: `lib/row-ops.ts` — puros: `setPartKind(rows, from, to, kind)`, `insertCue(rows, beforeIndex, target, text)`, `updateCue`, `removeRow`, `repeatRange(rows, from, to)`, `splitSlideAt(rows, index)`, `insertEmptyPart(rows, atIndex, kind)`, `rowsFromEditorNodes(nodes: EditorNode[], previous: WorshipRow[])`
- Create: `components/editor/{LyricsStep,LyricsDocument,SelectionToolbar,CueDialog,SlidesPreview,AudioCard}.tsx`
- Test: `lib/row-ops.test.ts`

`LyricsDocument`: um `contentEditable` não controlado. O DOM é montado de `rows` (um `div[data-row-id]` por linha; `cue` com `contenteditable="false"`; `break` como `div` vazio com `<br>`) só quando a mudança vem de fora (ação da barra, carga); em `input`, lê os filhos para `EditorNode[] = { id: string | null; kind: 'text' | 'cue'; text: string }` e chama `rowsFromEditorNodes`, que preserva `part`/`time` pelo id, dá id novo a duplicados e trata vazio como `break`. `paste` insere só texto puro. Os nomes das partes ficam numa coluna à parte, posicionados pelo `offsetTop` da linha.

`setPartKind`: a linha `from` passa a abrir parte `kind` (clima pela regra); se `to + 1` existe e não abre parte, passa a abrir uma com o tipo e o clima que tinha antes.

- [ ] Testes de `row-ops`: marcar o meio de um verso como Refrão gera três partes e a terceira mantém tipo e clima; `repeatRange` cria ids novos, sem `time`; `splitSlideAt` insere `break` e não duplica; `rowsFromEditorNodes` com ids repetidos, nó sem id e lista vazia (devolve documento vazio válido).
- [ ] Implementar; conferir no navegador depois (Tarefa 12). Commit.

### Task 9: Passo 2 (Áudio e tempo)

**Files:**
- Create: `components/editor/{TimingStep,PartsTimeline,usePlayer}.tsx`, `lib/timing.ts` — `markSlide(rows, slideRowId, time)`, `nudgeSlide(rows, slideRowId, delta)`, `slideStates(slides, duration): ('NONE'|'OK'|'CHECK'|'AI')[]`, `currentSlideIndex(slides, t)`
- Test: `lib/timing.test.ts`

`usePlayer(url)`: `<audio>` + `currentTime` por `requestAnimationFrame`, `toggle`, `seek`, `duration`. Espaço marca só quando o foco não está em campo de texto. Tempos arredondados a 0,01 s, nunca negativos.

- [ ] Testes: marcar grava e define `timeSource: 'MANUAL'`; tempo menor que o anterior → `CHECK`; `currentSlideIndex` com slides sem tempo.
- [ ] Implementar. Commit.

### Task 10: Passos 3 (Climas) e 4 (Prévia)

**Files:**
- Create: `components/editor/{MoodsStep,PreviewStep,ScreenFrame}.tsx`
- Test: `components/editor/PreviewStep.test.tsx` (lista de conferência e texto do Holyrics)

`MoodsStep`: `setPartMood(rows, partIndex, mood)` e "Voltar à sugestão" (`suggestMood`) em `row-ops.ts`. Barra de energia: altura `nível × 20%`, largura proporcional ao tempo até a próxima parte (igual quando falta tempo).
`PreviewStep`: "Pronta para o culto" chama `markReady`; desabilitado com dica do que falta quando `pending` tem algo além de `CONFIRM`; depois de pronta vira "Pronta" com opção de desfazer.

- [ ] Implementar e testar. Commit.

### Task 11: Roteiro (painel)

**Files:**
- Create: `pages/ServicePlanPage.tsx`, `components/service/{ServicePicker,NewServiceDialog,MomentsTab,WorshipTab,AddSongDialog,SortableList}.tsx`
- Test: `components/service/AddSongDialog.test.tsx`

`AddSongDialog`: busca com debounce em `GET /songs?q=`; com resultado, clicar adiciona; sem resultado (ou sempre, no rodapé) "Criar «texto»" → formulário (nome, letra, áudio opcional) com **Organizar** (cria com `organize: true`, envia áudio, adiciona ao roteiro, navega para o editor) e **Só adicionar ao roteiro** (cria sem organizar e adiciona).

- [ ] Testes: achou → `PUT songs` com o id acrescentado; não achou → mostra "Criar"; "Só adicionar" cria e adiciona.
- [ ] Implementar. Commit.

### Task 12: Gates e verificação no navegador

- [ ] API: `cd apps/api && npm ci && npx prisma generate && npx tsc --noEmit -p tsconfig.json && npm test && npm run build` → exit 0.
- [ ] Admin: `cd apps/admin && npm ci && npx tsc --noEmit -p tsconfig.app.json && npm run lint && npx vitest run && npm run build` → exit 0.
- [ ] Banco local descartável (contêiner Postgres próprio desta verificação), `migrate deploy`, seed, um usuário só com o grupo "Equipe de louvor".
- [ ] No navegador, com esse usuário: criar música colando letra → partes sugeridas → barrinha (Refrão, Instrução, Repete, Dividir) → enviar áudio → marcar tempos → climas → prévia tocando → Pronta; criar culto pelo modelo e adicionar músicas pelo modal. Capturas de tela como evidência.
- [ ] Inspecionar o diff inteiro, corrigir, repetir os gates.
