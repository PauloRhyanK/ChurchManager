# Painel admin (React + Vite + Tailwind)

Interface para gestão da igreja: autenticação JWT, configuração Asaas e visão de cotas.

**Primeiro arranque:** seguir [README na raiz](../../README.md#dev-quickstart). Se pedidos à API devolverem **404**, confirma que `VITE_API_URL` termina em `/api`.

## Requisitos

- Node.js 20+
- API Nest em execução ([apps/api](../api/README.md)) com `ADMIN_CORS_ORIGIN` a incluir `http://localhost:5173` (origem do Vite). Origens de **sites públicos** por igreja: base de dados (Configurações financeiras → Site público (CORS)), não esta variável.

## Configuração

1. Copiar `.env.example` para `.env`. Manter `VITE_API_URL=http://localhost:3000/api` salvo a API use outro host/porto.
2. `npm install`
3. Na API: migrar (e opcionalmente seed) — ver README raiz.

## Scripts

- `npm run dev` — servidor de desenvolvimento (porta 5173)
- `npm run build` — build de produção
- `npm run preview` — pré-visualizar o build

## Rotas principais

| Caminho | Descrição |
|---------|-----------|
| `/login` | Início de sessão |
| `/admin/financeiro/cotas` | Tabela de cotas (paginação e filtros na query string) |
| `/admin/configuracoes/financeiro` | Asaas, credenciais e **origens CORS** do site público |

## Stack

- React 19, React Router 7, TanStack Query, React Hook Form, Zod
- Tailwind CSS v4 (`@tailwindcss/vite`) e componentes UI no estilo [shadcn/ui](https://ui.shadcn.com/) (configuração manual no repositório)

## Estrutura (`src/`)

- `features/auth` — login
- `features/financial` — configuração financeira e cotas
- `components/ui` — primitivos de UI
- `lib` — cliente HTTP (`axios`), React Query, token em `sessionStorage`
- `routes` — `createBrowserRouter` e layout protegido
