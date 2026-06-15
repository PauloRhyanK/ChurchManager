# Inventário Supabase legado (igreja-paraiso)

Documento canónico para **KUS-33** e **KUS-35**. Mapeia tudo o que o site legado usa no Supabase para o schema Church Manager.

Repositório legado: `igreja-paraiso` (Next.js + Supabase).  
Schema alvo: `apps/api/prisma/schema.prisma`.

---

## Resumo executivo

| Tabela Supabase | Migrar? | Destino Church Manager | Notas |
|-----------------|---------|------------------------|-------|
| `events` | Sim | `events` + `tenant_id` | CRUD admin + site público |
| `event_registrations` | Sim | `event_registrations` + `tenant_id` | Inscrições; unique `(event_id, email)` |
| `schedules` | Sim | `schedules` + `tenant_id` | Programação semanal (admin) |
| `auth.users` | Parcial | — | Só admins viram `admin_users`; membros ficam para fase futura |
| `user_roles` + `roles` | Parcial | `admin_users.role` | Filtro `roles.name = 'admin'` |
| `site_sections` / CMS | Não (M?) | `site_sections` (futuro) | Fora do escopo M1 eventos |
| Pagamentos / Asaas | Não | `financial_*` (já existe) | Sem dados de eventos pagos no Supabase legado |

---

## 1. `events`

**Função:** cadastro de eventos (`/admin/eventos`, home, `/eventos`, `/evento/[id]`).

| Coluna Supabase | Tipo | Obrigatório | Church Manager |
|-----------------|------|-------------|----------------|
| `id` | uuid PK | sim | `Event.id` |
| — | — | — | `Event.tenantId` (**novo**) |
| `title` | text | sim | `Event.title` |
| `description` | text | não | `Event.description` |
| `date` | date | sim | `Event.date` |
| `time_start` | time | não | `Event.timeStart` |
| `time_end` | time | não | `Event.timeEnd` |
| `location` | text | não | `Event.location` |
| `image_url` | text | não | `Event.imageUrl` |
| `tag` | text | não | `Event.tag` |
| `published` | boolean | sim | `Event.published` |
| `created_at` | timestamptz | sim | `Event.createdAt` |
| `updated_at` | timestamptz | sim | `Event.updatedAt` |

**Queries legado → API nova:** ver [supabase-events-to-church-manager.md](./supabase-events-to-church-manager.md#endpoints-substituem-supabase).

---

## 2. `event_registrations`

**Função:** inscrições de participantes (modal, `/admin/inscricoes`, área membros).

| Coluna Supabase | Tipo | Obrigatório | Church Manager |
|-----------------|------|-------------|----------------|
| `id` | uuid PK | sim | `EventRegistration.id` |
| — | — | — | `EventRegistration.tenantId` (**novo**) |
| `event_id` | uuid FK | sim | `EventRegistration.eventId` |
| `name` | text | sim | `EventRegistration.name` |
| `email` | text | sim | `EventRegistration.email` (lowercase) |
| `phone` | text | não | `EventRegistration.phone` |
| `message` | text | não | `EventRegistration.message` |
| `user_id` | uuid FK auth | não | `EventRegistration.userId` (sem FK) |
| `created_at` | timestamptz | sim | `EventRegistration.createdAt` |

**Constraint:** `UNIQUE (event_id, email)`.

---

## 3. `schedules`

**Função:** programação semanal fixa (mesmo painel admin, separada de eventos).

| Coluna Supabase | Tipo | Obrigatório | Church Manager |
|-----------------|------|-------------|----------------|
| `id` | uuid PK | sim | `Schedule.id` |
| — | — | — | `Schedule.tenantId` (**novo**) |
| `title` | text | sim | `Schedule.title` |
| `day_of_week` | text | sim | `Schedule.dayOfWeek` |
| `time_start` | time | sim | `Schedule.timeStart` |
| `location` | text | não | `Schedule.location` |
| `description` | text | não | `Schedule.description` |
| `active` | boolean | sim | `Schedule.active` |
| `sort_order` | integer | sim | `Schedule.sortOrder` |
| `created_at` | timestamptz | sim | `Schedule.createdAt` |

---

## 4. Auth e admin (KUS-34)

### Supabase legado

| Artefacto | Função |
|-----------|--------|
| `auth.users` | Contas GoTrue (email, `encrypted_password`) |
| `roles` | Catálogo (`admin`, etc.) |
| `user_roles` | Liga user → role |
| Middleware Next.js | Protege `/admin/*` verificando role `admin` |

### Church Manager

| Modelo | Campos |
|--------|--------|
| `AdminUser` | `id`, `tenantId`, `email`, `passwordHash`, `role` (`TENANT_ADMIN` \| `PLATFORM_ADMIN`) |

### Mapeamento

| Supabase | Church Manager | Regra |
|----------|----------------|-------|
| `auth.users.email` | `admin_users.email` | lowercase, unique global |
| `auth.users.encrypted_password` | `admin_users.password_hash` | bcrypt — copiar hash se `$2a$` / `$2b$` |
| `user_roles` + `roles.name = 'admin'` | `admin_users.role = TENANT_ADMIN` | Um tenant por export |
| `auth.users.id` | — | **Não** migrar como PK; novo UUID ou manter só em audit |
| Membros (`auth.users` sem admin) | — | Fase futura; `event_registrations.user_id` preserva UUID legado |

Detalhe: [admin-users-mapping.md](./admin-users-mapping.md).

---

## 5. Entidades **não** migradas na M1 (KUS-35)

| Entidade / feature | Motivo | Milestone sugerida |
|--------------------|--------|-------------------|
| Tipos de ingresso / lotes | Não existem no Supabase | M2 |
| Pedidos / checkout Asaas eventos | Não existem no Supabase | M2 |
| Preço, vagas, `end_date` | Discutidos mas não implementados | M2+ |
| CMS / `site_sections` | Módulo separado | CMS roadmap |
| Escalas / células | Outros módulos admin | Backlog |
| `auth.users` (membros) | Auth de membros não existe na API | M4+ |

---

## 6. RLS legado → regras na API

| Operação | Supabase (RLS) | Church Manager |
|----------|----------------|----------------|
| SELECT events publicados | `published = true` | `EventsService.listForTenant({ publishedOnly: true })` |
| SELECT events admin | todos | JWT + `user.tenantId` |
| INSERT registration | público | POST público por `:slug` |
| SELECT registrations admin | admin vê todas | GET admin `/registrations` |
| SELECT own registrations | `user_id = auth.uid()` | GET `/registrations/mine?email=&userId=` |

---

## 7. Export SQL (referência)

Ver scripts em `apps/api/scripts/migration/README.md` e exemplos em `staging/examples/`.

---

## Referências

- [supabase-events-to-church-manager.md](./supabase-events-to-church-manager.md)
- [admin-users-mapping.md](./admin-users-mapping.md)
- Migration Prisma: `20260612210000_events_module`
