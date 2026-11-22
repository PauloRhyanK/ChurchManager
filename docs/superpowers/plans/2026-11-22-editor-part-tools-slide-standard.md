# Editor de músicas: partes e padrão de slides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ferramentas claras para dividir/unir/mover partes e anotações e aplicar à igreja toda limites configuráveis de caracteres e linhas por slide.

**Architecture:** Persistir limites no `WorshipSettings` já tenant-scoped e expô-los em uma rota de configurações de Cultos. O organizador usa esses valores; o editor consulta os mesmos valores para mostrar excedentes e reformatar apenas a estrutura. Operações puras em `row-ops` tratam ações sobre blocos e metadados.

**Tech Stack:** NestJS, Prisma/PostgreSQL, React, TypeScript, TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-21-editor-part-tools-slide-standard-design.md`

## Global Constraints

- Tenant é sempre derivado do JWT, nunca do corpo ou da URL.
- DTOs mantêm `whitelist` e `forbidNonWhitelisted`; validar limites no servidor.
- Interface e mensagens novas em pt-BR.
- Escritas do cliente montam o corpo campo a campo.
- Preservar dados de parte: divisão herda clima; união conserva clima do destino; mover preserva tempos/climas/anotações com suas linhas.
- Padrão na ausência de configuração: 28 caracteres por linha e 3 linhas por slide.
- Persistir novos limites sem quebrar igrejas existentes.

## Review Focus

- Configuração de outra igreja não pode vazar nem ser gravada: cobrir GET/PUT tenant scoped no Task 1.
- DTO rejeita limites ausentes, não numéricos e fora de faixa: cobrir no Task 1.
- Limites legados ausentes mantêm o padrão 28/3: cobrir no Task 2.
- Divisão/união/movimento não podem perder, duplicar nem transferir tempos/notas para outra linha: cobrir no Task 3.
- Readequar slides não pode perder texto, alterar a ordem ou romper partes e anotações: cobrir no Task 4.

---

### Task 1: Persistir e expor os limites por igreja

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`WorshipSettings`)
- Create: migration SQL em `apps/api/prisma/migrations/`
- Modify: `apps/api/src/modules/worship/dto/timing.dto.ts`
- Modify: `apps/api/src/modules/worship/worship-timing.service.ts`
- Modify: `apps/api/src/modules/worship/worship-timing.controller.ts`
- Test: `apps/api/src/modules/worship/worship-timing.spec.ts`

**Interfaces:**
- `GET /admin/tenants/me/worship/timing/settings` e `PUT` permanecem sem mudança para antecipação, sob `WORSHIP`.
- `GET /admin/tenants/me/worship/timing/lyrics-settings` devolve `{ lyricMaxChars, lyricMaxLines }` sob `WORSHIP:VIEW`.
- `PUT .../lyrics-settings` aceita `{ lyricMaxChars, lyricMaxLines }`, sob `SETTINGS:EDIT`.
- Campos novos em `WorshipSettings`: `lyricMaxChars Int @default(28)`, `lyricMaxLines Int @default(3)`.
- Faixas: caracteres 10–60; linhas 1–5.

- [x] Escrever testes de leitura default, gravação tenant-scoped, validação de faixa e isolamento por tenant.
- [x] Executar testes focados e confirmar as regras da API.
- [x] Adicionar migração com defaults 28/3, DTO validado e atualização parcial sem zerar os campos não enviados.
- [x] Executar testes focados de `worship-timing.spec.ts` e validar migração/schema com `npx prisma validate`.

### Task 2: Aplicar configuração na organização automática

**Files:**
- Modify: `apps/api/src/modules/worship/lyrics-organizer.ts`
- Modify: `apps/api/src/modules/worship/lyrics-format.ts` somente se a interface atual não permitir os valores já configurados
- Modify: serviço/controller de organização de músicas conforme dependências existentes
- Test: `apps/api/src/modules/worship/lyrics-organizer.spec.ts`

**Interfaces:**
- `organizeLyrics(input, options?)` recebe `maxC` e `maxLines` e mantém 28/3 como default para chamadas sem opções.

- [x] Escrever testes de organização com limites customizados e default 28/3.
- [x] Executar testes focados para os limites configurados.
- [x] Carregar `WorshipSettings` com tenant autenticado antes de organizar e passar os valores ao formatador.
- [x] Executar os testes focados de organização.

### Task 3: Operações puras para blocos de partes e anotações

**Files:**
- Modify: `apps/admin/src/features/worship/lib/row-ops.ts`
- Test: `apps/admin/src/features/worship/lib/row-ops.test.ts`

**Interfaces:**
- Exportar operações puras para dividir parte em um índice, unir parte adjacente e mover uma parte para índice anterior/posterior.
- Divisão cria nova fronteira e tipo/nome informados; clima da nova parte herda o original.
- União preserva a fronteira de destino, remove a fronteira unida e mantém tempos/anotações nas respectivas linhas.
- Movimento reordena todas as linhas da parte como um bloco.
- Exportar uma operação de readequação de slide que divide linhas por palavras respeitando `maxChars` e `maxLines`, sem mutar texto, ordem, fronteiras de parte ou dados das linhas existentes.

- [x] Escrever testes cobrindo limites da lista, partes com anotações e tempos, divisão com herança de clima, união com clima de destino e preservação de ids.
- [x] Executar `cd apps/admin && npx vitest run src/features/worship/lib/row-ops.test.ts`.
- [x] Implementar operações puras usando estrutura existente de linhas e helpers de `document.ts`.
- [x] Executar o teste focado e confirmar os invariantes.

### Task 4: Exibir status do padrão e readequar slides

**Files:**
- Modify: `apps/admin/src/features/worship/api/worship-api.ts`
- Modify: `apps/admin/src/features/worship/components/editor/LyricsStep.tsx`
- Modify: `apps/admin/src/features/worship/components/editor/LyricsDocument.tsx`
- Modify: `apps/admin/src/features/worship/components/editor/SelectionToolbar.tsx` ou componente dedicado reutilizando padrões
- Test: testes correspondentes de API e `LyricsStep`/editor

**Interfaces:**
- Buscar e salvar `lyricMaxChars` e `lyricMaxLines` pelo settings endpoint existente, mantendo chamadas de antecipação.
- Marcar cada slide que excede o limite; mostrar contagem e oferecer botão “Ajustar quebra do slide”.
- Não bloquear salvamento nem reescrever texto implicitamente.

- [x] Escrever testes para slide dentro/fora do limite e ação explícita de readequação preservando texto e anotação.
- [x] Executar testes focados para os limites e a readequação.
- [x] Carregar configuração no editor, derivar excedentes e acionar a operação do Task 3 em ação explícita.
- [x] Executar testes focados.

### Task 5: Ações de bloco e destino de anotação inequívocos

**Files:**
- Modify: `apps/admin/src/features/worship/components/editor/LyricsStep.tsx`
- Modify: `apps/admin/src/features/worship/components/editor/LyricsDocument.tsx`
- Modify: `apps/admin/src/features/worship/components/editor/PartNamePicker.tsx` (ou novo menu focado da parte)
- Test: testes novos de componentes do editor

**Interfaces:**
- Menu acessível por teclado em cada parte: dividir na seleção/linha, unir anterior/próxima, mover acima/abaixo e inserir anotação no início/fim.
- Alvos de arrasto explícitos entre linhas/slides e ao início/fim da parte; indicar visualmente o alvo antes de confirmar a soltura.
- Ações operam sobre o documento por `onChange`, preservando undo/redo e autosave atuais.

- [x] Escrever testes de interação para operações puras, seletor de tipo/nome e padrão do editor.
- [x] Executar testes focados das operações e componentes.
- [x] Conectar controles às operações puras do Task 3; conservar arrasto e Alt+setas como alternativas.
- [ ] Inspecionar visualmente os alvos adjacentes no navegador QA.

### Task 6: Verificação e entrega para produção

**Files:** verificar diff completo.

- [x] Executar gates API: `cd apps/api && npm ci && npx prisma generate && npx tsc --noEmit -p tsconfig.json && npm test && npm run build`.
- [x] Executar gates Admin: `cd apps/admin && npm ci && npx tsc --noEmit -p tsconfig.app.json && npm run lint && npx vitest run && npm run build`.
- [x] Inspecionar o diff e validar migração, tenant scoping e permissões; falta apenas confirmar visualmente o drop target adjacente.
- [ ] Commitar em branch de trabalho e abrir/atualizar PR para `qa`; não fazer push direto em `main`.
- [ ] Depois da validação em `qa`, promover pela rotina oficial de release para `main` e confirmar o deploy em produção.
