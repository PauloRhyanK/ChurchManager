# Site dentro de Igreja Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover a gestão do site para uma aba "Site" em Igreja, com a página inicial em linha de fluxo reordenável cuja ordem é renderizada pelo site público.

**Architecture:** A API guarda a ordem dos blocos da home numa tabela `SiteLayout` (uma linha por tenant) e a expõe no admin (`GET/PUT .../site-content/layout`) e no público (`layout.home`). O painel ganha a aba Site (componente próprio em `features/site`) dentro de `ChurchPage`, com abas na URL. O site `igreja-paraiso` resolve a ordem com fallback e monta a home por mapa id → componente.

**Tech Stack:** NestJS + Prisma (Postgres), `node:test`; React 18 + Vite + shadcn/ui + TanStack Query + react-router 6, vitest; Next.js (igreja-paraiso); `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0`, `@dnd-kit/utilities@3.2.2`.

**Spec:** `docs/superpowers/specs/2026-10-24-site-na-igreja-design.md`

## Global Constraints

- Blocos reordenáveis, ordem padrão: `mission`, `schedules`, `celulas`, `events`, `churches`, `giving`, `youtube`. `hero` e `contact` fixos, fora da lista.
- Tenant sempre do JWT. `ValidationPipe` com whitelist + `forbidNonWhitelisted` continua; DTO aceita só `home`.
- Corpo de escrita montado campo a campo no cliente: `{ home: [...] }`, nunca o objeto lido.
- Textos novos em pt-BR. Datas relativas com `pt-BR`.
- Abas: `?aba=filiais|pastores|ministerios|agenda|ofertorio|site`.
- Gates do `AGENTS.md` com exit 0 antes de cada commit de fechamento.

## Review Focus

- Tenant com ordem salva antes de um bloco novo existir no registry → público normaliza (bloco novo entra na posição padrão). Teste em Task 1.
- Usuário só com `SITE` abre `/igreja` → não dispara consultas de `CHURCH` (evita 403 em cascata) e cai na aba Site. Teste em Task 3.
- `?aba=` inválido ou sem permissão → primeira aba permitida, sem tela vazia. Teste em Task 3.
- Arrastar/setas e depois "Descartar" → volta exatamente à ordem salva; trocar de aba com ordem pendente pede confirmação. Teste em Task 4.
- Site recebe `layout` malformado (não array, ids repetidos) → ordem padrão sem quebrar a home. Teste em Task 6.

---

### Task 1: API — `SiteLayout`, endpoints e campo público

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model `SiteLayout`, relação `siteLayout SiteLayout?` em `Tenant`)
- Create: `apps/api/prisma/migrations/20261024120000_site_layout/migration.sql`
- Modify: `apps/api/src/modules/site/site-content.registry.ts` (`SITE_HOME_BLOCKS`)
- Create: `apps/api/src/modules/site/site-layout.ts` (funções puras)
- Create: `apps/api/src/modules/site/dto/update-site-layout.dto.ts`
- Modify: `apps/api/src/modules/site/site-content.service.ts`, `tenants-me-site-content.controller.ts`, `public-site-content.controller.ts`
- Test: `apps/api/src/modules/site/site-layout.spec.ts`, `site-authorization.spec.ts`

**Interfaces:**
- Produces: `SITE_HOME_BLOCKS: readonly ['mission','schedules','celulas','events','churches','giving','youtube']`; `type SiteHomeBlock`.
- Produces: `validateHomeOrder(raw: unknown): SiteHomeBlock[]` (lança `BadRequestException` pt-BR); `normalizeHomeOrder(stored: readonly string[] | null | undefined): SiteHomeBlock[]`.
- Produces: `SiteContentService.getLayoutForTenant(tenantId): Promise<{ home: SiteHomeBlock[]; updatedAt: string | null }>`; `updateLayoutForTenant(tenantId, home: unknown)` mesmo retorno.
- Produces HTTP: `GET/PUT /admin/tenants/me/site-content/layout`; público `{ sections, layout: { home } }`.

- [ ] Testes (falham primeiro): `validateHomeOrder` aceita permutação; rejeita faltando, repetido, desconhecido, não-array; `normalizeHomeOrder(null)` = padrão; remove desconhecido; insere faltante na posição padrão (`['youtube','mission',...sem schedules]` → `schedules` logo após `mission`); `getLayoutForTenant` filtra por `tenantId` e sem linha devolve padrão com `updatedAt: null`; `updateLayoutForTenant` faz upsert por `tenantId` e chama `notifyContentChanged`; authorization: `getLayout` com VIEW ok, `updateLayout` com VIEW → 403, com EDIT ok.
- [ ] Implementar. Rotas `layout` declaradas **antes** de `:key` no controller. Migração em SQL no estilo de `20260718150000_site_content` (`homeOrder` → coluna `home_order TEXT[]`, `tenant_id` único, FK cascade).
- [ ] `npx prisma generate && npx tsc --noEmit -p tsconfig.json && npm test` verde.
- [ ] Atualizar `docs/api/site-content-contract.md` (campo `layout`). Commit.

### Task 2: Painel — cliente da API de layout

**Files:** Modify `apps/admin/src/features/site/api/tenant-site-content-api.ts`; Test `.../tenant-site-content-api.test.ts`

**Interfaces:**
- Produces: `type SiteHomeBlock = 'mission'|'schedules'|'celulas'|'events'|'churches'|'giving'|'youtube'`; `interface SiteLayoutDto { home: SiteHomeBlock[]; updatedAt: string | null }`; `fetchSiteLayout(): Promise<SiteLayoutDto>`; `updateSiteLayout(home: SiteHomeBlock[]): Promise<SiteLayoutDto>` — envia exatamente `{ home: [...home] }`. Query key `["site-layout"]`.

- [ ] Teste: `updateSiteLayout` chama `api.put('/admin/tenants/me/site-content/layout', { home })` com cópia do array e nada mais. Implementar. Commit junto com Task 3.

### Task 3: Painel — navegação, permissões e abas na URL

**Files:** Modify `apps/admin/src/routes/PermissionRoute.tsx`, `AppRoutes.tsx`, `components/layout/AppSidebar.tsx`, `features/church/pages/ChurchPage.tsx`; Tests `AppRoutes.test.tsx`, `ChurchPage.test.tsx`

**Interfaces:**
- `PermissionRoute` aceita `module: PermissionModule | PermissionModule[]` (qualquer um basta).
- Sidebar: item Igreja com `modules: ['CHURCH','SITE']`; item Site removido.
- `/site` → `<Navigate to="/igreja?aba=site" replace />`; `/igreja` sob `PermissionRoute module={['CHURCH','SITE']}`.
- `ChurchPage`: aba ativa = `useSearchParams().get('aba')`, validada contra as abas permitidas; troca com `setSearchParams({ aba }, { replace: false })`. Consultas de igreja com `enabled: canViewChurch`.
- Aba Site renderiza `<SiteFlowTab onDirtyChange={setSiteDirty} onGoToTab={handleTabChange} />` (Task 4).

- [ ] Testes: `/site` redireciona e mostra a aba Site; só `SITE` → só aba Site visível e `fetchBranches` não chamado; `?aba=pastores` abre Pastores; `?aba=xyz` cai em Filiais; ordem pendente + trocar de aba → diálogo de descarte.
- [ ] Implementar. Ajustar testes existentes do `ChurchPage` para renderizar dentro de `MemoryRouter`.

### Task 4: Painel — aba Site em fluxo

**Files:**
- Create: `apps/admin/src/features/site/components/site-flow-blocks.ts` (metadados dos blocos)
- Create: `apps/admin/src/features/site/components/SiteFlowTab.tsx`
- Create: `apps/admin/src/features/site/components/SiteFlowRow.tsx`
- Create: `apps/admin/src/features/site/components/SiteSourcePreview.tsx`
- Delete: `apps/admin/src/features/site/pages/SitePage.tsx`
- Test: `apps/admin/src/features/site/components/SiteFlowTab.test.tsx`

**Interfaces:**
- `site-flow-blocks.ts`: `type ChurchTab = 'filiais'|'pastores'|'ministerios'|'agenda'|'ofertorio'|'site'`; `interface FlowBlock { id: string; title: string; icon: LucideIcon; kind: 'own'|'external'|'mixed'; sectionKey?: string; source?: { label: string; tab?: ChurchTab; href?: string } ; preview?: 'schedules'|'events'|'branches'|'pastors' }`; `HOME_BLOCKS: Record<SiteHomeBlock, FlowBlock>`; `FIXED_TOP`, `FIXED_BOTTOM` (contact), `OTHER_PAGES` (pastors, visit); `formatUpdatedAt(iso)` e `summarize(section)` movidos do `SitePage` (pt-BR).
- `SiteFlowTab({ onDirtyChange(dirty: boolean), onGoToTab(tab: ChurchTab) })`.
- `SiteSourcePreview({ kind })` — usa as queries `["schedules"]`, `["branches"]`, `["pastors"]` (com `enabled: can('CHURCH','VIEW')`) e `["events"]` (com `enabled: can('EVENTS','VIEW')`); mostra até 3 itens + "+N", só ativos/publicados (eventos: publicados com `date >= hoje`, ordenados por data). Sem permissão → `null`.

- [ ] Testes: renderiza na ordem do `fetchSiteLayout`; ↑ em "Células" + "Salvar ordem" chama `updateSiteLayout` com a nova ordem exata; "Descartar" restaura; `onDirtyChange(true)` após mover; Programação mostra "Ir para Agenda Semanal" e clicar chama `onGoToTab('agenda')`; prévia de agenda só com ativos e "+N"; sem `CHURCH:VIEW` a prévia some; sem `SITE:EDIT` não há alça/setas.
- [ ] Implementar com `@dnd-kit` (`DndContext` + `SortableContext` + `verticalListSortingStrategy`, sensores `PointerSensor` e `KeyboardSensor` com `sortableKeyboardCoordinates`) e botões ↑/↓ com `aria-label`.
- [ ] Gates do admin. Commit (Tasks 2–4).

### Task 5: Painel — painel lateral simplificado

**Files:** Modify `apps/admin/src/features/site/components/SiteSectionSheet.tsx`, `SiteFieldInput.tsx`; Test `SiteSectionSheet.test.tsx`

**Interfaces:**
- `SiteSectionSheet` ganha prop opcional `source?: { label: string; tab: ChurchTab }` e `onGoToSource?(tab)`; se houver rascunho alterado, pede confirmação (`DiscardChangesDialog`) antes de sair.
- Cabeçalho só título (descrição em `sr-only` para acessibilidade). Rodapé: "Cancelar" / "Salvar"; menu ⋯ (`DropdownMenu`) com "Restaurar original" → `AlertDialog` "Restaurar conteúdo original?".
- `SiteFieldInput`: `help` vira ícone `Info` com `Tooltip`; itens de lista em `Collapsible` (cabeçalho com título do item ou "Item N", ↑/↓/remover), item novo abre expandido. Título em 3 partes: `SiteSectionSheet` agrupa `titlePart1|titleHighlight|titlePart2` num `grid sm:grid-cols-3`.
- Textos pt-BR: "seção", "Salvar", "Conteúdo atualizado.", "Conteúdo restaurado.".

- [ ] Testes existentes continuam verdes; novos: "Restaurar original" só aparece após abrir o menu ⋯; link de origem chama `onGoToSource('ofertorio')`; com rascunho alterado, pede confirmação antes.
- [ ] Gates do admin. Commit.

### Task 6: Site `igreja-paraiso` — ordem da home

Repositório: `/Users/paulorhyankuster/projects/igreja-paraiso-site-na-igreja` (worktree, branch `feat/site-na-igreja`).

**Files:** Create `src/lib/site-content/home-order.ts` (+ teste); Modify `src/lib/site-content/types.ts`, `client.ts`, `data.ts`, `src/app/(site)/page.tsx`

**Interfaces:**
- `HOME_BLOCKS_DEFAULT = ['mission','schedules','celulas','events','churches','giving','youtube'] as const`; `resolveHomeOrder(layout: unknown): HomeBlock[]` (mesma regra de `normalizeHomeOrder` + tolera não-array/repetidos).
- `data.ts` expõe `getSiteHomeOrder(): Promise<HomeBlock[]>` usando a mesma chamada deduplicada.
- `page.tsx`: `Hero` primeiro; mapa `HomeBlock → ReactNode` (eventos continua condicional).

- [ ] Testes de `resolveHomeOrder`: undefined, não-array, desconhecido, repetido, faltando, válido.
- [ ] Implementar; `npm run lint`, testes e `npm run build` do site verdes. Commit.

### Task 7: Validação ponta a ponta

- [ ] Aplicar migração no banco local, subir API (3001), painel (8080) e site (3000, apontando para a API local).
- [ ] No painel: `/site` redireciona; reordenar (arrastar e setas), salvar; conferir no site a nova ordem; viewport mobile.
- [ ] Gates finais dos dois apps.
