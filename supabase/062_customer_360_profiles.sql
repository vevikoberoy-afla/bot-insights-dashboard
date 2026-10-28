-- Customer 360: permanently link commerce, booking and support records to a contact.
-- Idempotent and safe to run after 051/052.

ALTER TABLE public.feature_bookings
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;
ALTER TABLE public.commerce_orders
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS feature_bookings_contact_idx
  ON public.feature_bookings(client_id, contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS commerce_orders_contact_idx
  ON public.commerce_orders(client_id, contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_orders_contact_id_idx
  ON public.support_orders(client_id, contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS feature_bookings_identity_idx
  ON public.feature_bookings(client_id, lower(customer_email), customer_phone);
CREATE INDEX IF NOT EXISTS commerce_orders_identity_idx
  ON public.commerce_orders(client_id, lower(customer_email), customer_phone);

CREATE OR REPLACE FUNCTION public.customer_phone_key(value text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT right(regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g'), 10)
$$;

CREATE OR REPLACE FUNCTION public.attach_customer_contact()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE matched_contact uuid;
BEGIN
  IF NEW.contact_id IS NOT NULL THEN RETURN NEW; END IF;
  SELECT c.id INTO matched_contact
  FROM public.contacts c
  WHERE c.client_id = NEW.client_id
    AND (
      (nullif(lower(trim(NEW.customer_email)), '') IS NOT NULL AND lower(trim(c.email)) = lower(trim(NEW.customer_email)))
      OR
      (length(public.customer_phone_key(NEW.customer_phone)) >= 7 AND public.customer_phone_key(c.phone) = public.customer_phone_key(NEW.customer_phone))
    )
  ORDER BY c.last_active_at DESC NULLS LAST, c.created_at DESC
  LIMIT 1;
  NEW.contact_id := matched_contact;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS feature_bookings_attach_contact ON public.feature_bookings;
CREATE TRIGGER feature_bookings_attach_contact BEFORE INSERT OR UPDATE OF customer_email, customer_phone, contact_id
ON public.feature_bookings FOR EACH ROW EXECUTE FUNCTION public.attach_customer_contact();

DROP TRIGGER IF EXISTS commerce_orders_attach_contact ON public.commerce_orders;
CREATE TRIGGER commerce_orders_attach_contact BEFORE INSERT OR UPDATE OF customer_email, customer_phone, contact_id
ON public.commerce_orders FOR EACH ROW EXECUTE FUNCTION public.attach_customer_contact();

DROP TRIGGER IF EXISTS support_orders_attach_contact ON public.support_orders;
CREATE TRIGGER support_orders_attach_contact BEFORE INSERT OR UPDATE OF customer_email, customer_phone, contact_id
ON public.support_orders FOR EACH ROW EXECUTE FUNCTION public.attach_customer_contact();

-- Also attach records that arrived before the customer identified themselves.
CREATE OR REPLACE FUNCTION public.attach_existing_customer_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.feature_bookings SET contact_id = NEW.id WHERE client_id = NEW.client_id AND contact_id IS NULL AND (
    (nullif(lower(trim(NEW.email)), '') IS NOT NULL AND lower(trim(customer_email)) = lower(trim(NEW.email))) OR
    (length(public.customer_phone_key(NEW.phone)) >= 7 AND public.customer_phone_key(customer_phone) = public.customer_phone_key(NEW.phone))
  );
  UPDATE public.commerce_orders SET contact_id = NEW.id WHERE client_id = NEW.client_id AND contact_id IS NULL AND (
    (nullif(lower(trim(NEW.email)), '') IS NOT NULL AND lower(trim(customer_email)) = lower(trim(NEW.email))) OR
    (length(public.customer_phone_key(NEW.phone)) >= 7 AND public.customer_phone_key(customer_phone) = public.customer_phone_key(NEW.phone))
  );
  UPDATE public.support_orders SET contact_id = NEW.id WHERE client_id = NEW.client_id AND contact_id IS NULL AND (
    (nullif(lower(trim(NEW.email)), '') IS NOT NULL AND lower(trim(customer_email)) = lower(trim(NEW.email))) OR
    (length(public.customer_phone_key(NEW.phone)) >= 7 AND public.customer_phone_key(customer_phone) = public.customer_phone_key(NEW.phone))
  );
  UPDATE public.tickets SET contact_id = NEW.id WHERE client_id = NEW.client_id AND contact_id IS NULL
    AND nullif(lower(trim(NEW.email)), '') IS NOT NULL AND lower(trim(customer_email)) = lower(trim(NEW.email));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contacts_attach_existing_history ON public.contacts;
CREATE TRIGGER contacts_attach_existing_history AFTER INSERT OR UPDATE OF email, phone
ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.attach_existing_customer_history();

UPDATE public.feature_bookings record SET contact_id = (
  SELECT c.id FROM public.contacts c WHERE c.client_id = record.client_id AND (
    (nullif(lower(trim(record.customer_email)), '') IS NOT NULL AND lower(trim(c.email)) = lower(trim(record.customer_email))) OR
    (length(public.customer_phone_key(record.customer_phone)) >= 7 AND public.customer_phone_key(c.phone) = public.customer_phone_key(record.customer_phone))
  ) ORDER BY c.last_active_at DESC NULLS LAST, c.created_at DESC LIMIT 1
) WHERE record.contact_id IS NULL;

UPDATE public.commerce_orders record SET contact_id = (
  SELECT c.id FROM public.contacts c WHERE c.client_id = record.client_id AND (
    (nullif(lower(trim(record.customer_email)), '') IS NOT NULL AND lower(trim(c.email)) = lower(trim(record.customer_email))) OR
    (length(public.customer_phone_key(record.customer_phone)) >= 7 AND public.customer_phone_key(c.phone) = public.customer_phone_key(record.customer_phone))
  ) ORDER BY c.last_active_at DESC NULLS LAST, c.created_at DESC LIMIT 1
) WHERE record.contact_id IS NULL;

UPDATE public.support_orders record SET contact_id = (
  SELECT c.id FROM public.contacts c WHERE c.client_id = record.client_id AND (
    (nullif(lower(trim(record.customer_email)), '') IS NOT NULL AND lower(trim(c.email)) = lower(trim(record.customer_email))) OR
    (length(public.customer_phone_key(record.customer_phone)) >= 7 AND public.customer_phone_key(c.phone) = public.customer_phone_key(record.customer_phone))
  ) ORDER BY c.last_active_at DESC NULLS LAST, c.created_at DESC LIMIT 1
) WHERE record.contact_id IS NULL;

UPDATE public.tickets ticket SET contact_id = (
  SELECT c.id FROM public.contacts c WHERE c.client_id = ticket.client_id
    AND nullif(lower(trim(ticket.customer_email)), '') IS NOT NULL
    AND lower(trim(c.email)) = lower(trim(ticket.customer_email))
  ORDER BY c.last_active_at DESC NULLS LAST, c.created_at DESC LIMIT 1
) WHERE ticket.contact_id IS NULL;

-- Keep the complete customer history when two captured identities are stitched.
CREATE OR REPLACE FUNCTION public.stitch_contacts_atomic(
  p_canonical_id uuid, p_stale_id uuid, p_incoming_email text DEFAULT NULL,
  p_incoming_phone text DEFAULT NULL, p_session_id text DEFAULT NULL,
  p_source text DEFAULT 'message_extraction'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE canonical public.contacts; stale public.contacts;
BEGIN
  IF p_canonical_id = p_stale_id THEN RETURN p_canonical_id; END IF;
  SELECT * INTO canonical FROM public.contacts WHERE id = p_canonical_id FOR UPDATE;
  IF NOT FOUND THEN RETURN p_stale_id; END IF;
  SELECT * INTO stale FROM public.contacts WHERE id = p_stale_id FOR UPDATE;
  IF NOT FOUND THEN RETURN p_canonical_id; END IF;

  UPDATE public.contacts SET
    name = CASE WHEN canonical.name IS NULL OR canonical.name ~* '^(web(?:site)? visitor|anonymous)' THEN coalesce(nullif(stale.name,''), canonical.name) ELSE canonical.name END,
    email = coalesce(canonical.email, stale.email, p_incoming_email),
    phone = coalesce(canonical.phone, stale.phone, p_incoming_phone),
    tags = array(SELECT DISTINCT unnest(coalesce(canonical.tags,'{}'::text[]) || coalesce(stale.tags,'{}'::text[]))),
    custom_fields = coalesce(stale.custom_fields,'{}'::jsonb) || coalesce(canonical.custom_fields,'{}'::jsonb),
    opt_in_web = canonical.opt_in_web OR coalesce(stale.opt_in_web,false),
    opt_in_email = canonical.opt_in_email OR coalesce(stale.opt_in_email,false),
    opt_in_whatsapp = canonical.opt_in_whatsapp OR coalesce(stale.opt_in_whatsapp,false),
    opt_in_sms = canonical.opt_in_sms OR coalesce(stale.opt_in_sms,false),
    conversation_count = coalesce(canonical.conversation_count,0) + coalesce(stale.conversation_count,0),
    last_active_at = greatest(canonical.last_active_at, stale.last_active_at, now()), updated_at = now()
  WHERE id = p_canonical_id;

  UPDATE public.sessions SET contact_id = p_canonical_id WHERE contact_id = p_stale_id;
  UPDATE public.capture_prompts_log SET contact_id = p_canonical_id WHERE contact_id = p_stale_id;
  UPDATE public.consent_log SET contact_id = p_canonical_id WHERE contact_id = p_stale_id;
  UPDATE public.feature_bookings SET contact_id = p_canonical_id WHERE contact_id = p_stale_id;
  UPDATE public.commerce_orders SET contact_id = p_canonical_id WHERE contact_id = p_stale_id;
  UPDATE public.support_orders SET contact_id = p_canonical_id WHERE contact_id = p_stale_id;
  UPDATE public.tickets SET contact_id = p_canonical_id WHERE contact_id = p_stale_id;
  INSERT INTO public.contact_merge_log(canonical_id, merged_id, session_id, merged_at) VALUES(p_canonical_id,p_stale_id,p_session_id,now());
  DELETE FROM public.contacts WHERE id = p_stale_id;
  RETURN p_canonical_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
