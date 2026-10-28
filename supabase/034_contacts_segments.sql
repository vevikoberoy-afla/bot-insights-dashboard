-- 034_contacts_segments.sql
-- Migration for Contacts & Segments CRM Layer

-- 1. Contacts Table
CREATE TABLE IF NOT EXISTS public.contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    name TEXT,
    email TEXT,
    phone TEXT,
    avatar_url TEXT,
    source_channel TEXT, -- 'web' | 'whatsapp' | 'email' | 'sms' | 'instagram'
    source_bot_id UUID REFERENCES public.bots(id) ON DELETE SET NULL,
    tags TEXT[] DEFAULT '{}',
    custom_fields JSONB DEFAULT '{}'::jsonb,
    opt_in_web BOOLEAN DEFAULT true,
    opt_in_whatsapp BOOLEAN DEFAULT false,
    opt_in_email BOOLEAN DEFAULT false,
    opt_in_sms BOOLEAN DEFAULT false,
    conversation_count INTEGER DEFAULT 0,
    last_active_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Upgrade existing table from 012_contacts.sql schema if necessary
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='contacts' AND column_name='primary_channel') THEN
        ALTER TABLE public.contacts RENAME COLUMN primary_channel TO source_channel;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='contacts' AND column_name='custom_properties') THEN
        ALTER TABLE public.contacts RENAME COLUMN custom_properties TO custom_fields;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='contacts' AND column_name='source_bot_id') THEN
        ALTER TABLE public.contacts ADD COLUMN source_bot_id UUID;
        ALTER TABLE public.contacts ADD COLUMN opt_in_web BOOLEAN DEFAULT true;
        ALTER TABLE public.contacts ADD COLUMN opt_in_whatsapp BOOLEAN DEFAULT false;
        ALTER TABLE public.contacts ADD COLUMN opt_in_email BOOLEAN DEFAULT false;
        ALTER TABLE public.contacts ADD COLUMN opt_in_sms BOOLEAN DEFAULT false;
        ALTER TABLE public.contacts ADD COLUMN conversation_count INTEGER DEFAULT 0;
    END IF;
END $$;

-- 2. Segments Table
CREATE TABLE IF NOT EXISTS public.segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT,
    filter_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
    contact_count INTEGER DEFAULT 0,
    is_dynamic BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Segment Contacts (for static segments)
CREATE TABLE IF NOT EXISTS public.segment_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    segment_id UUID NOT NULL REFERENCES public.segments(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(segment_id, contact_id)
);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_contacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- FIX: Drop the trigger if it already exists before creating it
DROP TRIGGER IF EXISTS update_contacts_updated_at ON public.contacts;
CREATE TRIGGER update_contacts_updated_at
BEFORE UPDATE ON public.contacts
FOR EACH ROW EXECUTE FUNCTION update_contacts_updated_at();

CREATE OR REPLACE FUNCTION update_segments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- FIX: Drop the trigger if it already exists before creating it
DROP TRIGGER IF EXISTS update_segments_updated_at ON public.segments;
CREATE TRIGGER update_segments_updated_at
BEFORE UPDATE ON public.segments
FOR EACH ROW EXECUTE FUNCTION update_segments_updated_at();

-- RLS Policies
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.segment_contacts ENABLE ROW LEVEL SECURITY;

-- Note: If you run this script multiple times, policy creation might also throw errors.
-- You can wrap policies in a DO block or drop them first if needed, but if it hasn't 
-- failed on policies yet, you are safe to proceed.

-- Contacts Policies
DO $$ BEGIN DROP POLICY IF EXISTS "Users can view their own contacts" ON public.contacts; EXCEPTION WHEN undefined_object THEN END $$;
CREATE POLICY "Users can view their own contacts" 
ON public.contacts FOR SELECT 
USING (auth.uid() = client_id);

DO $$ BEGIN DROP POLICY IF EXISTS "Users can insert their own contacts" ON public.contacts; EXCEPTION WHEN undefined_object THEN END $$;
CREATE POLICY "Users can insert their own contacts" 
ON public.contacts FOR INSERT 
WITH CHECK (auth.uid() = client_id);

DO $$ BEGIN DROP POLICY IF EXISTS "Users can update their own contacts" ON public.contacts; EXCEPTION WHEN undefined_object THEN END $$;
CREATE POLICY "Users can update their own contacts" 
ON public.contacts FOR UPDATE 
USING (auth.uid() = client_id);

DO $$ BEGIN DROP POLICY IF EXISTS "Users can delete their own contacts" ON public.contacts; EXCEPTION WHEN undefined_object THEN END $$;
CREATE POLICY "Users can delete their own contacts" 
ON public.contacts FOR DELETE 
USING (auth.uid() = client_id);

-- Segments Policies
DO $$ BEGIN DROP POLICY IF EXISTS "Users can view their own segments" ON public.segments; EXCEPTION WHEN undefined_object THEN END $$;
CREATE POLICY "Users can view their own segments" 
ON public.segments FOR SELECT 
USING (auth.uid() = client_id);

DO $$ BEGIN DROP POLICY IF EXISTS "Users can insert their own segments" ON public.segments; EXCEPTION WHEN undefined_object THEN END $$;
CREATE POLICY "Users can insert their own segments" 
ON public.segments FOR INSERT 
WITH CHECK (auth.uid() = client_id);

DO $$ BEGIN DROP POLICY IF EXISTS "Users can update their own segments" ON public.segments; EXCEPTION WHEN undefined_object THEN END $$;
CREATE POLICY "Users can update their own segments" 
ON public.segments FOR UPDATE 
USING (auth.uid() = client_id);

DO $$ BEGIN DROP POLICY IF EXISTS "Users can delete their own segments" ON public.segments; EXCEPTION WHEN undefined_object THEN END $$;
CREATE POLICY "Users can delete their own segments" 
ON public.segments FOR DELETE 
USING (auth.uid() = client_id);

-- Segment Contacts Policies
DO $$ BEGIN DROP POLICY IF EXISTS "Users can view segment contacts for their segments" ON public.segment_contacts; EXCEPTION WHEN undefined_object THEN END $$;
CREATE POLICY "Users can view segment contacts for their segments"
ON public.segment_contacts FOR SELECT
USING (EXISTS (SELECT 1 FROM public.segments s WHERE s.id = segment_contacts.segment_id AND s.client_id = auth.uid()));

DO $$ BEGIN DROP POLICY IF EXISTS "Users can insert segment contacts for their segments" ON public.segment_contacts; EXCEPTION WHEN undefined_object THEN END $$;
CREATE POLICY "Users can insert segment contacts for their segments"
ON public.segment_contacts FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.segments s WHERE s.id = segment_contacts.segment_id AND s.client_id = auth.uid()));

DO $$ BEGIN DROP POLICY IF EXISTS "Users can delete segment contacts for their segments" ON public.segment_contacts; EXCEPTION WHEN undefined_object THEN END $$;
CREATE POLICY "Users can delete segment contacts for their segments"
ON public.segment_contacts FOR DELETE
USING (EXISTS (SELECT 1 FROM public.segments s WHERE s.id = segment_contacts.segment_id AND s.client_id = auth.uid()));

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_contacts_client_id ON public.contacts(client_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON public.contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON public.contacts(phone);
CREATE INDEX IF NOT EXISTS idx_segments_client_id ON public.segments(client_id);
CREATE INDEX IF NOT EXISTS idx_segment_contacts_segment_id ON public.segment_contacts(segment_id);
CREATE INDEX IF NOT EXISTS idx_segment_contacts_contact_id ON public.segment_contacts(contact_id);