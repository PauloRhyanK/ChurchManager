# Painel admin (React + Vite + Tailwind)

Interface para gestão da igreja: autenticação JWT, configuração Asaas e visão de cotas.

## Requisitos

- Node.js 20+
- API Nest em execução ([apps/api](../api/README.md)) com `ADMIN_CORS_ORIGIN` a incluir a origem deste app (ex.: `http://localhost:5173`)

## Configuração

1. Copiar `.env.example` para `.env` e ajustar `VITE_API_URL` se necessário (por defeito `http://localhost:3000/api`).
2. `npm install`
3. Na API: `npx prisma migrate deploy`, `npx prisma db seed` — cria utilizador demo `admin@demo.local` / `demo123456` (ou variáveis `ADMIN_SEED_*`).

## Scripts

- `npm run dev` — servidor de desenvolvimento (porta 5173)
- `npm run build` — build de produção
- `npm run preview` — pré-visualizar o build

## Rotas principais

| Caminho | Descrição |
|---------|-----------|
| `/login` | Início de sessão |
| `/admin/financeiro/cotas` | Tabela de cotas (paginação e filtros na query string) |
| `/admin/configuracoes/financeiro` | API Key e webhook token Asaas |

## Stack

- React 19, React Router 7, TanStack Query, React Hook Form, Zod
- Tailwind CSS v4 (`@tailwindcss/vite`) e componentes UI no estilo [shadcn/ui](https://ui.shadcn.com/) (configuração manual no repositório)

## Estrutura (`src/`)

- `features/auth` — login
- `features/financial` — configuração financeira e cotas
- `components/ui` — primitivos de UI
- `lib` — cliente HTTP (`axios`), React Query, token em `sessionStorage`
- `routes` — `createBrowserRouter` e layout protegido
