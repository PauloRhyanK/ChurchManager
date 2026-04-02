# ADR 0001 — Transição da visão Supabase/PostgREST para API Nest.js única

## Estado

Aceite.

## Contexto

Documentação e conversas iniciais descreviam **Supabase** como camada de dados e API: PostgreSQL, **GoTrue** (auth), **PostgREST** (REST gerado a partir das tabelas) e admin a falar com o PostgREST via `@supabase/supabase-js`, com **RLS** como principal mecanismo de isolamento por tenant.

A direcção de produto e engenharia evoluiu para:

- Uma **API REST única** em **Nest.js** sobre **PostgreSQL**.
- **Autenticação e autorização** tratadas na aplicação (JWT, guards, serviços), com `tenant_id` sempre aplicado nas operações de dados.
- **Sem** exposição do PostgREST ao browser para o domínio de negócio; o admin e o site falam **apenas** com a nossa API.
- Integrações sensíveis (ex.: **Asaas**) apenas no backend, em adapters hexagonais.

## Decisão

1. Adoptar **Nest.js** como único backend HTTP para regras de negócio, CRUD e integrações.
2. Manter **PostgreSQL** como base de dados; o modelo relacional editorial (`tenants`, `users`, `events`, `site_sections`) permanece válido em espírito, com `users` modelado na nossa base (não dependente de `auth.users` do Supabase).
3. Tratar a documentação histórica baseada em Supabase como **substituída** por [architecture.md](../architecture.md) e ADRs.
4. Isolamento multitenant **no servidor**: filtros por `tenant_id` em repositórios/serviços e políticas de acesso explícitas; não depender de RLS como única linha de defesa no cliente.

## Consequências

- **Positivas:** Controlo total sobre endpoints, validação, auditoria, versão de API e integração Asaas; uma única narrativa de segurança no código da API.
- **Negativas:** É necessário implementar e manter endpoints, migrações e testes que o PostgREST geraria automaticamente; mais código de aplicação do que no modelo BaaS.

## Referências

- [architecture.md](../architecture.md)
