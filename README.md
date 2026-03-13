# ChurchManager

CMS for manage church, like events, website and others future things.

---

## Architecture Overview

ChurchManager follows a **Headless Composable Architecture** with three main pillars:

| Pillar | Technology | Role |
|--------|-----------|------|
| **Backend & Data** | [Supabase](https://supabase.com) | PostgreSQL + GoTrue Auth + PostgREST API + Storage |
| **Admin Panel** | React + Vite (`admin-panel/`) | SPA for authenticated church administrators |
| **Public Website** | Next.js (`igreja-paraiso/`) | SSR/ISR public site for visitors |

### Data Model

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `tenants` | `id`, `name`, `slug` | One row per church |
| `users` | `id` (FK → `auth.users`), `tenant_id`, `role` | Admin profiles |
| `events` | `id`, `tenant_id`, `title`, `date`, `is_active` | Church calendar |
| `site_sections` | `id`, `tenant_id`, `section_key`, `content (JSONB)` | CMS content blocks |

Row-Level Security (RLS) policies are defined in `supabase/migrations/` to ensure complete tenant data isolation.

---

## Project Structure

```
ChurchManager/
├── supabase/
│   ├── config.toml                        # Local dev configuration
│   ├── migrations/
│   │   └── 20240101000000_initial_schema.sql  # Tables + RLS policies
│   └── seed.sql                           # Sample data for local dev
├── admin-panel/                           # React/Vite admin SPA
│   ├── src/
│   │   ├── lib/supabase.ts               # Supabase client
│   │   ├── context/AuthContext.tsx        # Auth state
│   │   ├── components/ProtectedRoute.tsx  # Route guard
│   │   └── pages/                         # Login, Events, SiteSections
│   └── .env.example
└── igreja-paraiso/                        # Next.js public website
    ├── src/
    │   ├── app/                           # App Router pages
    │   ├── lib/
    │   │   ├── supabase.ts               # Lazy Supabase client
    │   │   └── data.ts                   # Cached data-fetching helpers
    │   └── types/index.ts
    └── .env.example
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- [Supabase CLI](https://supabase.com/docs/guides/cli) (for local dev)
- A Supabase project (or use the local dev stack)

### 1. Database Setup

```bash
# Start local Supabase stack
supabase start

# Apply migrations and seed data
supabase db reset
```

Or apply the migration manually in your Supabase dashboard by running `supabase/migrations/20240101000000_initial_schema.sql`.

### 2. Admin Panel

```bash
cd admin-panel
cp .env.example .env
# Edit .env with your Supabase URL and anon key
npm install
npm run dev        # http://localhost:5173
```

### 3. Public Website

```bash
cd igreja-paraiso
cp .env.example .env.local
# Edit .env.local with your Supabase URL, anon key, and tenant slug
npm install
npm run dev        # http://localhost:3000
```

---

## Security Notes

- **RLS is mandatory.** Every table has Row-Level Security enabled. Policies enforce that each tenant only sees its own data.
- The public website uses the **anon key** (read-only, subject to RLS). It always filters by `tenant_id` explicitly as a defence-in-depth measure.
- Admin users authenticate via Supabase GoTrue (`/auth/v1/...`). The JWT `tenant_id` claim drives the RLS isolation.
