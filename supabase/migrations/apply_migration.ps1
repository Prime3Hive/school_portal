# WARNING: Never hardcode credentials here.
# Set these as environment variables or use the Supabase CLI instead:
#   $env:SUPABASE_ACCESS_TOKEN = "sbp_..."
#   $env:SUPABASE_PROJECT_REF  = "your-project-ref"
$token      = $env:SUPABASE_ACCESS_TOKEN
$projectRef = $env:SUPABASE_PROJECT_REF

$sql = @'
CREATE TABLE IF NOT EXISTS public.school_settings (
  id            INTEGER PRIMARY KEY DEFAULT 1,
  settings_json JSONB   NOT NULL DEFAULT '{}',
  updated_at    TIMESTAMPTZ DEFAULT now()
);
INSERT INTO public.school_settings (id, settings_json)
VALUES (1, '{}') ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access to school_settings" ON public.school_settings;
CREATE POLICY "Admin full access to school_settings"
  ON public.school_settings FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.custom_roles (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id     TEXT        NOT NULL UNIQUE,
  role_name   TEXT        NOT NULL,
  permissions JSONB       NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access to custom_roles" ON public.custom_roles;
CREATE POLICY "Admin full access to custom_roles"
  ON public.custom_roles FOR ALL USING (true) WITH CHECK (true);
'@

$body = @{ query = $sql } | ConvertTo-Json -Depth 5
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type"  = "application/json"
}

Write-Host "Applying migration to project: $projectRef ..."

try {
    $resp = Invoke-RestMethod `
        -Uri "https://api.supabase.com/v1/projects/$projectRef/database/query" `
        -Method Post `
        -Headers $headers `
        -Body $body `
        -ErrorAction Stop

    Write-Host "SUCCESS! Migration applied."
    $resp | ConvertTo-Json
}
catch {
    $errBody = $_.ErrorDetails.Message
    Write-Host "API Error: $($_.Exception.Message)"
    if ($errBody) { Write-Host "Details: $errBody" }
}
