-- 041_lead_capture_v2.sql
-- Lead Capture System v2: Active Trigger Engine, Consent Audit, Identity Stitching, and Fatigue Control

-- 1. ADD COLUMNS TO CONTACTS TABLE
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS capture_method TEXT,          -- 'triggered_prompt' | 'message_extraction' | 'widget_form' | 'whatsapp' | 'import'
  ADD COLUMN IF NOT EXISTS last_prompted_at TIMESTAMPTZ, -- global ask fatigue signal
  ADD COLUMN IF NOT EXISTS device_fingerprint TEXT;       -- device ID for cross-session tracking

CREATE INDEX IF NOT EXISTS idx_contacts_device_fp ON public.contacts(device_fingerprint);

-- 2. CAPTURE TRIGGERS (Rule definitions for active conversational asks)
CREATE TABLE IF NOT EXISTS public.capture_triggers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    bot_id              UUID REFERENCES public.bots(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    is_active           BOOLEAN DEFAULT true,
    priority            INTEGER DEFAULT 100,               -- lower = evaluated first

    -- What field this trigger is trying to capture
    target_field        TEXT NOT NULL,                     -- 'email' | 'phone' | 'name'

    -- Condition type + config
    condition_type      TEXT NOT NULL,                    -- 'intent_keyword' | 'cart_value_threshold' | 'handoff_requested' | 'message_count_no_contact' | 'product_view_count' | 'exit_intent' | 'time_on_site' | 'returning_visitor'
    condition_config    JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- What the bot says when this fires
    prompt_template     TEXT NOT NULL,                    -- e.g. "Want me to email you the full pricing breakdown so you have it handy?"
    options             JSONB DEFAULT '["Sure, here is my email", "No thanks"]'::jsonb,

    -- Fatigue control
    cooldown_minutes     INTEGER DEFAULT 1440,             -- don't re-fire same trigger inside this window (1440m = 24h)
    max_asks_per_session INTEGER DEFAULT 1,

    created_at           TIMESTAMPTZ DEFAULT now(),
    updated_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_capture_triggers_client_active ON public.capture_triggers(client_id, is_active);
CREATE INDEX IF NOT EXISTS idx_capture_triggers_bot ON public.capture_triggers(bot_id);

-- 3. CAPTURE PROMPTS LOG (Audit trail of triggered asks & customer outcomes)
CREATE TABLE IF NOT EXISTS public.capture_prompts_log (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trigger_id        UUID REFERENCES public.capture_triggers(id) ON DELETE SET NULL,
    contact_id        UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    session_id        TEXT NOT NULL,
    target_field      TEXT NOT NULL,
    prompt_text       TEXT,
    fired_at          TIMESTAMPTZ DEFAULT now(),
    outcome           TEXT DEFAULT 'pending',   -- 'pending' | 'provided' | 'declined' | 'ignored'
    resolved_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_prompts_log_contact ON public.capture_prompts_log(contact_id, fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompts_log_session ON public.capture_prompts_log(session_id);

-- 4. CONSENT LOG (Audit trail for GDPR, CCPA, and DPDP compliance)
CREATE TABLE IF NOT EXISTS public.consent_log (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id    UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    channel       TEXT NOT NULL,        -- 'web' | 'whatsapp' | 'email' | 'sms'
    opted_in      BOOLEAN NOT NULL,
    source        TEXT NOT NULL,        -- 'widget_form' | 'message_extraction' | 'triggered_prompt' | 'whatsapp' | 'csv_import' | 'manual'
    prompt_shown  TEXT,                 -- verbatim copy of what the customer was shown
    session_id    TEXT,
    created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consent_log_contact ON public.consent_log(contact_id, created_at DESC);

-- 5. CONTACT MERGE LOG (Audit trail for Identity Stitching)
CREATE TABLE IF NOT EXISTS public.contact_merge_log (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_id  UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    merged_id     UUID NOT NULL,   -- the id of the stale contact that was merged into canonical
    session_id    TEXT,
    merged_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_merge_log_canonical ON public.contact_merge_log(canonical_id);

-- 6. ATOMIC IDENTITY STITCHING STORED PROCEDURE
CREATE OR REPLACE FUNCTION public.stitch_contacts_atomic(
    p_canonical_id UUID,
    p_stale_id UUID,
    p_incoming_email TEXT DEFAULT NULL,
    p_incoming_phone TEXT DEFAULT NULL,
    p_session_id TEXT DEFAULT NULL,
    p_source TEXT DEFAULT 'message_extraction'
) RETURNS UUID AS $$
DECLARE
    v_stale RECORD;
    v_canonical RECORD;
BEGIN
    -- Prevent self-merge
    IF p_canonical_id = p_stale_id THEN
        RETURN p_canonical_id;
    END IF;

    -- Row-level lock on canonical contact
    SELECT * INTO v_canonical FROM public.contacts WHERE id = p_canonical_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN p_stale_id;
    END IF;

    -- Row-level lock on stale contact
    SELECT * INTO v_stale FROM public.contacts WHERE id = p_stale_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN p_canonical_id;
    END IF;

    -- 1. Update canonical contact merging missing fields from stale contact
    UPDATE public.contacts SET
        name               = CASE 
                               WHEN v_canonical.name IS NULL OR v_canonical.name LIKE 'Web Visitor%' 
                               THEN COALESCE(NULLIF(v_stale.name, ''), v_canonical.name)
                               ELSE v_canonical.name
                             END,
        email              = COALESCE(v_canonical.email, v_stale.email, p_incoming_email),
        phone              = COALESCE(v_canonical.phone, v_stale.phone, p_incoming_phone),
        tags               = array(SELECT DISTINCT unnest(COALESCE(v_canonical.tags, '{}'::text[]) || COALESCE(v_stale.tags, '{}'::text[]))),
        opt_in_web         = v_canonical.opt_in_web OR COALESCE(v_stale.opt_in_web, false),
        opt_in_email       = v_canonical.opt_in_email OR COALESCE(v_stale.opt_in_email, false),
        opt_in_whatsapp    = v_canonical.opt_in_whatsapp OR COALESCE(v_stale.opt_in_whatsapp, false),
        opt_in_sms         = v_canonical.opt_in_sms OR COALESCE(v_stale.opt_in_sms, false),
        conversation_count = COALESCE(v_canonical.conversation_count, 0) + COALESCE(v_stale.conversation_count, 0),
        last_active_at     = GREATEST(v_canonical.last_active_at, v_stale.last_active_at, now()),
        updated_at         = now()
    WHERE id = p_canonical_id;

    -- 2. Re-point sessions from stale to canonical
    UPDATE public.sessions SET contact_id = p_canonical_id WHERE contact_id = p_stale_id;

    -- 3. Re-point capture_prompts_log from stale to canonical
    UPDATE public.capture_prompts_log SET contact_id = p_canonical_id WHERE contact_id = p_stale_id;

    -- 4. Re-point consent_log from stale to canonical
    UPDATE public.consent_log SET contact_id = p_canonical_id WHERE contact_id = p_stale_id;

    -- 5. Record merge in contact_merge_log
    INSERT INTO public.contact_merge_log (canonical_id, merged_id, session_id, merged_at)
    VALUES (p_canonical_id, p_stale_id, p_session_id, now());

    -- 6. Delete stale contact
    DELETE FROM public.contacts WHERE id = p_stale_id;

    -- 7. Log consent update if email/phone was introduced
    IF p_incoming_email IS NOT NULL THEN
        INSERT INTO public.consent_log (contact_id, channel, opted_in, source, session_id)
        VALUES (p_canonical_id, 'email', true, p_source, p_session_id);
    END IF;

    IF p_incoming_phone IS NOT NULL THEN
        INSERT INTO public.consent_log (contact_id, channel, opted_in, source, session_id)
        VALUES (p_canonical_id, 'whatsapp', true, p_source, p_session_id);
    END IF;

    RETURN p_canonical_id;
END;
$$ LANGUAGE plpgsql;

-- 7. RLS POLICIES
ALTER TABLE public.capture_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capture_prompts_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_merge_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to capture_triggers" ON public.capture_triggers;
CREATE POLICY "Service role full access to capture_triggers" ON public.capture_triggers FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access to capture_prompts_log" ON public.capture_prompts_log;
CREATE POLICY "Service role full access to capture_prompts_log" ON public.capture_prompts_log FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access to consent_log" ON public.consent_log;
CREATE POLICY "Service role full access to consent_log" ON public.consent_log FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access to contact_merge_log" ON public.contact_merge_log;
CREATE POLICY "Service role full access to contact_merge_log" ON public.contact_merge_log FOR ALL TO service_role USING (true) WITH CHECK (true);
