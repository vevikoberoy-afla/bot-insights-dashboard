-- 012_contacts.sql
-- Adds the CRM and Contact Segmentation features
-- Run after 011_inbox.sql

-- ═══════════════════════════════════════════════════════════════
-- 1. CONTACTS TABLE
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.contacts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    avatar_url TEXT,
    primary_channel TEXT DEFAULT 'web',
    tags TEXT[] DEFAULT '{}',
    custom_properties JSONB DEFAULT '{}'::jsonb,
    first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Note: We now link sessions to contacts instead of just tracking raw sessions.
ALTER TABLE public.sessions ADD CONSTRAINT fk_contact FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════════
-- 2. CONTACT SEGMENTS TABLE
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.contact_segments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    rules JSONB NOT NULL, -- e.g., [{"field": "last_active", "op": ">", "val": "7d"}]
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(client_id, name)
);

-- ═══════════════════════════════════════════════════════════════
-- 3. SEGMENT MEMBERS (Many-to-Many Cache)
-- For fast lookup of who belongs to which segment
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.contact_segment_members (
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    segment_id UUID NOT NULL REFERENCES public.contact_segments(id) ON DELETE CASCADE,
    PRIMARY KEY(contact_id, segment_id)
);

-- ═══════════════════════════════════════════════════════════════
-- 4. RLS POLICIES
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_segment_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to contacts" ON public.contacts;
CREATE POLICY "Service role full access to contacts" ON public.contacts FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access to segments" ON public.contact_segments;
CREATE POLICY "Service role full access to segments" ON public.contact_segments FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access to segment_members" ON public.contact_segment_members;
CREATE POLICY "Service role full access to segment_members" ON public.contact_segment_members FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated read contacts" ON public.contacts;
CREATE POLICY "Authenticated read contacts" ON public.contacts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated read segments" ON public.contact_segments;
CREATE POLICY "Authenticated read segments" ON public.contact_segments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated read segment_members" ON public.contact_segment_members;
CREATE POLICY "Authenticated read segment_members" ON public.contact_segment_members FOR SELECT TO authenticated USING (true);

-- ═══════════════════════════════════════════════════════════════
-- 5. INDEXES
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_contacts_client_id ON public.contacts(client_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON public.contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON public.contacts(phone);
CREATE INDEX IF NOT EXISTS idx_contact_segments_client_id ON public.contact_segments(client_id);
