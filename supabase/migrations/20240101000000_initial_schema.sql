-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Table: tenants
-- Represents each church organisation (tenant) in the multi-tenant
-- system. Each church has a unique URL slug used for routing on the
-- public website (e.g., /igreja-paraiso). All data tables include a
-- tenant_id foreign key that is enforced by Row-Level Security (RLS).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tenants (
  id         UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       VARCHAR(255) NOT NULL,
  slug       VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Table: users (public profile linked to Supabase auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
  id        UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role      VARCHAR(50) NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Table: events
-- Church calendar events belonging to a tenant
-- ============================================================
CREATE TABLE IF NOT EXISTS public.events (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID         NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title       VARCHAR(255) NOT NULL,
  date        TIMESTAMPTZ  NOT NULL,
  description TEXT,
  banner_url  TEXT,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Table: site_sections
-- Dynamic CMS content for each tenant's public website
-- ============================================================
CREATE TABLE IF NOT EXISTS public.site_sections (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID         NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  section_key VARCHAR(50)  NOT NULL,
  content     JSONB        NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_tenant_section UNIQUE (tenant_id, section_key)
);

-- ============================================================
-- JWT Custom Claims
-- The RLS policies below rely on a `tenant_id` claim inside the
-- Supabase-issued JWT. Supabase supports custom claims via a
-- database hook function. The function below reads the user's
-- tenant_id from the public.users profile and injects it into
-- the JWT claims returned by GoTrue on every sign-in.
--
-- To activate it in the Supabase dashboard go to:
--   Authentication > Hooks > Custom Access Token Hook
-- and select the function `public.custom_access_token_hook`.
-- ============================================================
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims       JSONB;
  user_tenant  UUID;
BEGIN
  claims := event -> 'claims';

  SELECT tenant_id
    INTO user_tenant
    FROM public.users
   WHERE id = (event ->> 'user_id')::UUID;

  IF user_tenant IS NOT NULL THEN
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(user_tenant::TEXT));
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Grant execution rights so GoTrue can call the hook
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;

-- ============================================================
-- Row-Level Security (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.tenants      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_sections ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------
-- tenants: authenticated users can only read their own tenant row
-- ---------------------------------------------------------------
CREATE POLICY "Tenants: read own"
  ON public.tenants
  FOR SELECT
  USING (id = (auth.jwt() ->> 'tenant_id')::UUID);

-- ---------------------------------------------------------------
-- users: authenticated users can only read/update their own row
-- ---------------------------------------------------------------
CREATE POLICY "Users: read own tenant members"
  ON public.users
  FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

-- ---------------------------------------------------------------
-- events: isolate per tenant (read for anon + authenticated)
-- ---------------------------------------------------------------
CREATE POLICY "Events: isolate tenants"
  ON public.events
  FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

-- Anon / public read access (for the Next.js public website)
-- The calling code must always filter by tenant_id explicitly.
CREATE POLICY "Events: public read active"
  ON public.events
  FOR SELECT
  TO anon
  USING (is_active = TRUE);

-- ---------------------------------------------------------------
-- site_sections: isolate per tenant (admins write, anon reads)
-- ---------------------------------------------------------------
CREATE POLICY "Site sections: isolate tenants"
  ON public.site_sections
  FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY "Site sections: public read"
  ON public.site_sections
  FOR SELECT
  TO anon
  USING (TRUE);
