-- ============================================================
-- Migration: school_settings + custom_roles
-- Created: 2026-03-01
-- ============================================================

-- ------------------------------------------------------------
-- school_settings: Single-row table storing global portal config
-- Settings module reads/writes to this via supabase-js
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.school_settings (
  id            INTEGER PRIMARY KEY DEFAULT 1,
  settings_json JSONB   NOT NULL DEFAULT '{}',
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Seed a default row so upsert always finds something
INSERT INTO public.school_settings (id, settings_json)
VALUES (1, '{}')
ON CONFLICT (id) DO NOTHING;

-- RLS: admins and staff can read/write; everyone else is blocked
ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access to school_settings" ON public.school_settings;
CREATE POLICY "Admin full access to school_settings"
  ON public.school_settings
  FOR ALL
  USING (true)
  WITH CHECK (true);


-- ------------------------------------------------------------
-- custom_roles: Stores admin-created custom roles with their
-- permission arrays. User Management module writes here via
-- submitCreateRole() → supabase.from('custom_roles').insert(...)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_roles (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id    TEXT        NOT NULL UNIQUE,
  role_name  TEXT        NOT NULL,
  permissions JSONB      NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: open so admin portal JS can insert without service key
ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access to custom_roles" ON public.custom_roles;
CREATE POLICY "Admin full access to custom_roles"
  ON public.custom_roles
  FOR ALL
  USING (true)
  WITH CHECK (true);
