-- =========================================================
-- CATAUTH IDENTITY GATEWAY — SUPABASE POSTGRESQL SCHEMA
-- =========================================================

-- 1. Table: credentials (Hardware NFC Keys & Passkeys Vault)
CREATE TABLE IF NOT EXISTS public.credentials (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'usr_demo_john_doe',
    credential_id TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    sign_count BIGINT DEFAULT 0,
    aaguid TEXT,
    transports TEXT[] DEFAULT ARRAY['nfc'],
    is_active BOOLEAN DEFAULT TRUE,
    revocation_reason TEXT,
    revoked_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default initial cards
INSERT INTO public.credentials (id, user_id, credential_id, label, sign_count, transports, is_active)
VALUES 
  ('cred_01', 'usr_demo_john_doe', 'FIDO2-NFC-KEY-ALPHA-01', 'YubiKey 5 NFC (Alpha Key)', 0, ARRAY['nfc', 'usb'], TRUE),
  ('cred_02', 'usr_demo_john_doe', 'FIDO2-NFC-KEY-BETA-02', 'Feitian ePass FIDO2 (Beta Key)', 42, ARRAY['nfc'], TRUE),
  ('cred_03', 'usr_demo_john_doe', 'FIDO2-NFC-KEY-REVOKED-03', 'Compromised Token (Test Revoked)', 105, ARRAY['nfc'], FALSE)
ON CONFLICT (credential_id) DO NOTHING;


-- 2. Table: protected_links (Protected Links & Card Whitelist)
CREATE TABLE IF NOT EXISTS public.protected_links (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    target_redirect_url TEXT NOT NULL,
    allowed_card_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
    require_pin BOOLEAN DEFAULT FALSE,
    geofence_enabled BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    total_taps INTEGER DEFAULT 0,
    successful_passes INTEGER DEFAULT 0,
    blocked_attempts INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default protected links
INSERT INTO public.protected_links (id, slug, title, description, target_redirect_url, allowed_card_ids, require_pin, geofence_enabled, is_active, total_taps, successful_passes, blocked_attempts)
VALUES 
  ('lnk_alpha_portal', 'portal-produksi', 'Portal Karyawan Produksi', 'Gateway akses dashboard internal karyawan shift 1 & 2', 'https://catauth.vercel.app/sso/callback', ARRAY['FIDO2-NFC-KEY-ALPHA-01', 'FIDO2-NFC-KEY-BETA-02'], FALSE, TRUE, TRUE, 128, 124, 4),
  ('lnk_secret_vault', 'brankas-vip', 'Brankas Data VIP & API Keys', 'Akses otorisasi brankas kunci enkripsi master level 4', 'https://catauth.vercel.app/sso/callback', ARRAY['FIDO2-NFC-KEY-ALPHA-01'], TRUE, TRUE, TRUE, 45, 41, 4)
ON CONFLICT (id) DO NOTHING;


-- 3. Table: audit_logs (Security & Telemetry Audit Events)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    event_type TEXT NOT NULL,
    client_id TEXT,
    link_id TEXT,
    link_title TEXT,
    card_id TEXT,
    card_label TEXT,
    ip_address TEXT,
    country TEXT DEFAULT 'ID',
    status TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);


-- 4. Enable Row Level Security (RLS) & Policies for Public Access
ALTER TABLE public.credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.protected_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Allow anon read and write (or service role)
CREATE POLICY "Allow all access to credentials" ON public.credentials FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to protected_links" ON public.protected_links FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to audit_logs" ON public.audit_logs FOR ALL USING (true) WITH CHECK (true);
