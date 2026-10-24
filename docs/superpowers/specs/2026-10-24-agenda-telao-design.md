# Agenda do telão — eventos + programação semanal

Data: 24/10/2026 · Branches: `feat/site-na-igreja` (monorepo e igreja-paraiso). Depende da aba Site (`2026-10-24-site-na-igreja-design.md`).

## Problema

A tela `/projecao-agenda` (Holyrics) mostra só eventos publicados. A programação semanal padrão (Igreja → Agenda Semanal) não aparece no telão, e não há como escolher o que vai para lá.

## Decisões

- **Linha do tempo única:** horários semanais ativos viram ocorrências datadas nos próximos 7 dias (fuso America/Sao_Paulo) e se misturam aos eventos publicados de hoje em diante, ordenados por data e hora.
- **Escolher o que aparece:** cada evento e cada horário semanal pode ser ocultado do telão. A ordem é sempre cronológica. Ocultar um horário semanal vale para todas as semanas.
- **Configuração própria do telão** (`ProjectionSettings`, uma linha por tenant, permissão `SITE`), editada na aba Site. Não mexe nos formulários de evento e horário.
- A linha do tempo é montada **na API**, fonte única para a prévia do painel e para o telão.

## API

Modelo `ProjectionSettings`: `tenantId` único, `hiddenEventIds String[]`, `hiddenScheduleIds String[]`, timestamps. Sem linha → nada oculto.

Item da agenda:

```ts
{
  key: string;          // "event:<id>" | "schedule:<id>:<YYYY-MM-DD>"
  kind: 'event' | 'schedule';
  sourceId: string;     // id do evento ou do horário
  title: string;
  date: string;         // YYYY-MM-DD
  timeStart: string | null; // HH:MM
  timeEnd: string | null;   // HH:MM (só eventos)
  location: string | null;
  note: string | null;      // shortDescription do evento / description do horário
  hidden: boolean;
}
```

Ordenação: data, depois horário (sem horário primeiro), depois evento antes de horário, depois título.

- `GET /admin/tenants/me/projection/agenda` (`SITE:VIEW`) → `{ items, days: 7, updatedAt }` com `hidden` marcado.
- `PUT /admin/tenants/me/projection/settings` (`SITE:EDIT`) com `{ hiddenEventIds: string[], hiddenScheduleIds: string[] }` (UUIDs, até 500 cada) → mesmo formato do GET. Ids que não pertencem ao tenant são descartados ao salvar. Dispara a revalidação do site.
- `GET /public/tenants/:slug/projection-agenda` → `{ items }` só com os visíveis, sem o campo `hidden`.

## Site (igreja-paraiso)

- `/api/projecao-agenda` lê o endpoint novo e devolve o mesmo formato de hoje (`avisos[]`): `id = key`, `inicio`/`fim` com `-03:00`, `observacao = note`, `local = location`.
- Se o endpoint novo responder 404 (API antiga), volta ao caminho atual (só eventos). Outros erros → 503, como hoje.
- A página estática não muda.

## Painel

- Botão **"Agenda do telão"** no cabeçalho da aba Site. Abre um painel lateral:
  - Itens agrupados por dia ("Hoje", "Amanhã", "Domingo, 25 de out."), com horário, título, selo "Programação semanal" ou "Evento" e interruptor "Mostrar no telão".
  - Alternar um horário semanal alterna todas as ocorrências dele (aviso: "vale para todas as semanas").
  - Atalhos "Editar na Agenda Semanal" (com `CHURCH:VIEW`) e "Abrir Eventos" (com `EVENTS:VIEW`).
  - "Salvar" envia só os dois arrays; fechar com alteração pede confirmação. Sem `SITE:EDIT`, interruptores desabilitados e sem Salvar.
- Linha Programação do fluxo: resumo "Horários de culto ativos, também no telão".
- Agenda Semanal (Igreja): descrição "Estes horários aparecem no site e no telão."

## Impacto

- Home do site e Contato: sem mudança (continuam lendo `schedules`).
- Eventos: sem mudança; só publicados entram no telão.
- Deploy: API + painel, depois site (com fallback de 404).

## Fora do escopo

Ocultar uma única ocorrência de horário semanal; fixar destaques; mudar o visual do telão; janela configurável de dias.

## Testes

- API: expansão dos horários nos 7 dias certos (inclui hoje, respeita dia da semana), mistura e ordenação com eventos, ocultos marcados no admin e removidos no público, horário inativo e evento não publicado fora, PUT descarta ids de outro tenant, 403 sem `SITE:EDIT`, revalidação chamada.
- Site: mapeamento item → aviso; fallback para eventos em 404; 503 em outros erros.
- Painel: agrupamento por dia, alternar horário alterna todas as ocorrências, salvar envia exatamente os dois arrays, confirmação ao fechar com alteração, atalhos só com permissão, leitura sem Salvar.
