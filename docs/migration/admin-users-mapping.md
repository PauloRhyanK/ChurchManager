# Mapeamento admin — Supabase → Church Manager

Documento para **KUS-34**: validação de campos e procedimento de importação de administradores.

---

## Validação de campos

| Campo Church Manager | Origem Supabase | Status | Notas |
|---------------------|-----------------|--------|-------|
| `tenantId` | — (novo) | Obrigatório | Resolver por `--tenant-slug` no script |
| `email` | `auth.users.email` | OK | Unique na tabela `admin_users` |
| `passwordHash` | `auth.users.encrypted_password` | OK* | *Copiar se bcrypt (`$2a$` / `$2b$`); senão reset manual |
| `role` | `roles.name` via `user_roles` | OK | `admin` → `TENANT_ADMIN` |
| `id` | `auth.users.id` | Opcional | Script gera novo UUID por defeito; usar `--keep-ids` se necessário |

### Campos Supabase **sem** equivalente directo

| Supabase | Decisão |
|----------|---------|
| `auth.users.raw_user_meta_data` | Ignorar na M1 |
| `auth.users.phone` | Ignorar (admin login só email) |
| `roles` catálogo completo | Só importamos quem tem `admin` |
| RLS policies | Substituídas por guards Nest + `tenantId` |

### Campos Church Manager **sem** origem Supabase

| Campo | Valor |
|-------|-------|
| `PLATFORM_ADMIN` | Criado manualmente / seed — não vem do site legado |
| Multi-tenant | Cada export Supabase = 1 tenant |

---

## Export no Supabase

```sql
SELECT
  u.id,
  lower(trim(u.email)) AS email,
  u.encrypted_password AS password_hash
FROM auth.users u
INNER JOIN public.user_roles ur ON ur.user_id = u.id
INNER JOIN public.roles r ON r.id = ur.role_id
WHERE r.name = 'admin'
  AND u.email IS NOT NULL;
```

Exportar como JSON array → `admin_users.json` (ver exemplo em `scripts/migration/staging/examples/`).

---

## Import

```bash
cd apps/api
npm run script:migrate-supabase-admin-users -- \
  --tenant-slug=paraiso \
  --dir=scripts/migration/staging/paraiso \
  --dry-run
```

Remover `--dry-run` para persistir.

### Comportamento do script

1. Resolve `tenant_id` pelo slug.
2. Para cada registo: upsert por `(tenantId, email)` — **não** duplica.
3. Valida hash bcrypt antes de gravar.
4. Atribui `TENANT_ADMIN` por defeito.

### Se a password não for bcrypt

O script ignora o registo e lista emails para reset manual via painel ou SQL:

```sql
-- Após definir hash gerado offline
UPDATE admin_users SET password_hash = '$2b$...' WHERE email = 'admin@igreja.com';
```

---

## Checklist pós-migração admin

- [ ] Login funciona no painel `/login` com email migrado
- [ ] JWT contém `tenantId` correcto
- [ ] Admin **não** vê dados de outro tenant (ver testes KUS-37)
- [ ] Credenciais demo do seed desactivadas em produção
