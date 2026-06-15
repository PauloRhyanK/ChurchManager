# Migração Supabase → Church Manager (scripts)

Scripts one-shot para importar dados do projecto **igreja-paraiso** para a API multitenant.

## Pré-requisitos

1. Tenant criado no Church Manager (ex. slug `paraiso`).
2. Migration `20260612210000_events_module` aplicada: `npx prisma migrate deploy`.
3. Exports JSON colocados numa pasta por igreja.

## Estrutura de staging

```
scripts/migration/staging/
  paraiso/                    # uma pasta por tenant/slug
    events.json
    event_registrations.json
    schedules.json
    admin_users.json          # opcional — script separado
  examples/                   # exemplos versionados (vazios/demo)
```

Ver `staging/examples/` para formato de cada ficheiro.

## Exportar do Supabase

### Eventos

```sql
COPY (
  SELECT id, title, description, date, time_start, time_end,
         location, image_url, tag, published, created_at, updated_at
  FROM public.events
) TO STDOUT WITH CSV HEADER;
```

Converter CSV → JSON array (ou usar `\copy` + ferramenta). Campos em **snake_case** como no exemplo.

### Inscrições

```sql
COPY (
  SELECT id, event_id, name, lower(trim(email)) AS email,
         phone, message, user_id, created_at
  FROM public.event_registrations
) TO STDOUT WITH CSV HEADER;
```

### Programação

```sql
COPY (
  SELECT id, title, day_of_week, time_start, location, description,
         active, sort_order, created_at
  FROM public.schedules
) TO STDOUT WITH CSV HEADER;
```

### Admins

Ver [admin-users-mapping.md](../../../docs/migration/admin-users-mapping.md).

## Executar import editorial

```bash
cd apps/api
npm run script:migrate-supabase-editorial -- \
  --tenant-slug=paraiso \
  --dir=scripts/migration/staging/paraiso \
  --dry-run
```

Ordem de import: `events` → `event_registrations` → `schedules` (FK).

Flags:

| Flag | Descrição |
|------|-----------|
| `--tenant-slug=` | Slug do tenant destino (obrigatório) |
| `--dir=` | Pasta com JSON (obrigatório) |
| `--dry-run` | Simula sem gravar |
| `--skip-existing` | Ignora IDs já presentes (idempotente) |

## Executar import admins

```bash
npm run script:migrate-supabase-admin-users -- \
  --tenant-slug=paraiso \
  --dir=scripts/migration/staging/paraiso \
  --dry-run
```

## Validação

Após import:

```bash
npm test -- --test-name-pattern=isolation
```

E smoke manual:

- `GET /api/public/tenants/paraiso/events/published`
- Login admin + `GET /api/admin/tenants/me/events`
