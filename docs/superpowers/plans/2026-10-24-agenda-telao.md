# Agenda do telão Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Telão mostra eventos + programação semanal numa linha do tempo, com escolha do que aparece feita na aba Site.

**Architecture:** Novo módulo `projection` na API monta a agenda (horários expandidos nos próximos 7 dias + eventos publicados futuros, menos os ocultos de `ProjectionSettings`). Painel ganha um painel lateral na aba Site; o site troca a fonte de `/api/projecao-agenda` com fallback.

**Tech Stack:** NestJS + Prisma, `node:test`; React + TanStack Query + shadcn, vitest; Next.js (igreja-paraiso), vitest.

**Spec:** `docs/superpowers/specs/2026-10-24-agenda-telao-design.md`

## Global Constraints

- Fuso America/Sao_Paulo; janela de 7 dias começando hoje.
- Tenant do JWT; DTO só aceita `hiddenEventIds` e `hiddenScheduleIds` (arrays de UUID, máx. 500).
- Corpo do PUT montado campo a campo no cliente.
- Textos em pt-BR.

## Review Focus

- Virada do dia: "hoje" calculado em São Paulo, não em UTC (servidor em UTC às 22h de SP já é amanhã em UTC). Teste em Task 1.
- Horário com `dayOfWeek` fora de `SCHEDULE_DAYS` (dado legado) → ignorado, sem quebrar. Teste em Task 1.
- Evento oculto que depois é apagado → id órfão não quebra nada. Teste em Task 1.
- Painel: alternar e "desalternar" volta a não ter alteração pendente. Teste em Task 2.
- Site com API antiga (404) continua mostrando eventos. Teste em Task 3.

---

### Task 1: API — `ProjectionSettings` e agenda do telão

**Files:** Modify `apps/api/prisma/schema.prisma`; Create migration `20261024180000_projection_settings`; Create `apps/api/src/modules/projection/{projection.module.ts, projection-agenda.ts, projection.service.ts, tenants-me-projection.controller.ts, public-projection.controller.ts, dto/update-projection-settings.dto.ts, projection.spec.ts}`; Modify `apps/api/src/app.module.ts`.

**Interfaces:**
- `buildProjectionAgenda(input: { today: Date; schedules: ScheduleLike[]; events: EventLike[]; hiddenEventIds: string[]; hiddenScheduleIds: string[]; days?: number }): ProjectionAgendaItem[]` (pura).
- `ProjectionService.getAgendaForTenant(tenantId, now?) → { items, days, updatedAt }`; `updateSettingsForTenant(tenantId, dto)` → mesmo; `getPublicAgenda(tenantId, now?) → { items: Omit<Item,'hidden'>[] }`.
- HTTP conforme a spec.

- [ ] Testes (falham primeiro) para a função pura e o service, cobrindo a Review Focus e a seção Testes da spec; authorization (`getAgenda` VIEW ok, `updateSettings` VIEW → 403, EDIT ok).
- [ ] Implementar; migração via `prisma migrate diff`.
- [ ] Gates da API. Commit.

### Task 2: Painel — "Agenda do telão"

**Files:** Create `apps/admin/src/features/site/api/projection-api.ts` (+ teste), `apps/admin/src/features/site/components/ProjectionAgendaSheet.tsx` (+ teste); Modify `SiteFlowTab.tsx`, `site-flow-blocks.ts`, `apps/admin/src/features/church/pages/ChurchPage.tsx`.

**Interfaces:**
- `fetchProjectionAgenda(): Promise<ProjectionAgendaDto>`; `updateProjectionSettings(body: { hiddenEventIds: string[]; hiddenScheduleIds: string[] }): Promise<ProjectionAgendaDto>` — envia exatamente os dois arrays. Query key `["projection-agenda"]`.
- `ProjectionAgendaSheet({ open, onOpenChange, onGoToTab })`.

- [ ] Testes: agrupamento por dia; alternar horário alterna todas as ocorrências; alternar duas vezes volta a não ter pendência; salvar envia os arrays exatos; fechar com alteração pede confirmação; atalhos por permissão; leitura sem Salvar.
- [ ] Implementar; botão no cabeçalho da aba Site; textos em Programação e Agenda Semanal.
- [ ] Gates do admin. Commit.

### Task 3: Site — `/api/projecao-agenda` com programação

**Files (worktree igreja-paraiso-site-na-igreja):** Modify `src/lib/projecao/agenda.ts` (+ teste), `src/app/api/projecao-agenda/route.ts`; Modify `src/lib/events/client.ts` ou criar `src/lib/projecao/client.ts`.

**Interfaces:** `fetchProjectionAgenda(): Promise<{ items: ProjectionAgendaItemDto[] }>` (lança erro com `status`); `montarProjecaoDaAgenda(items, agora?) → ProjecaoAgenda`; rota tenta o endpoint novo e, em 404, usa `montarProjecaoAgenda(eventos)`.

- [ ] Testes: mapeamento item → aviso (com e sem horário, com `timeEnd`); rota: 404 → fallback eventos; outro erro → 503.
- [ ] Implementar; testes, tsc, build. Commit.

### Task 4: Validação ponta a ponta e revisão

- [ ] Banco local migrado, API + painel + site locais; ocultar um horário no painel e conferir `/api/projecao-agenda` e a tela `/projecao-agenda`.
- [ ] Revisão final do branch; corrigir Critical/Important.
