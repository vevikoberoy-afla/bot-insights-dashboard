-- Per-bot booking/commerce assignments and FAQ-to-knowledge migration.
-- Apply after 052_commerce_and_automation.sql. Safe to rerun.
CREATE TABLE IF NOT EXISTS public.bot_commerce_config (
 bot_id uuid PRIMARY KEY REFERENCES public.bots(id) ON DELETE CASCADE,
 client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 booking_enabled boolean NOT NULL DEFAULT true,
 ordering_enabled boolean NOT NULL DEFAULT true,
 show_catalog boolean NOT NULL DEFAULT true,
 allow_booking_management boolean NOT NULL DEFAULT true,
 allow_order_management boolean NOT NULL DEFAULT true,
 menu_title text NOT NULL DEFAULT 'How can I help?',
 booking_label text NOT NULL DEFAULT 'Book an appointment',
 catalogue_label text NOT NULL DEFAULT 'Browse products',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(bot_id,client_id)
);
CREATE TABLE IF NOT EXISTS public.bot_booking_services (
 bot_id uuid NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
 service_id uuid NOT NULL REFERENCES public.booking_services(id) ON DELETE CASCADE,
 client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 sort_order integer NOT NULL DEFAULT 0, custom_label text, PRIMARY KEY(bot_id,service_id)
);
CREATE TABLE IF NOT EXISTS public.bot_booking_offers (
 bot_id uuid NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
 offer_id uuid NOT NULL REFERENCES public.booking_offers(id) ON DELETE CASCADE,
 client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 sort_order integer NOT NULL DEFAULT 0, custom_label text, PRIMARY KEY(bot_id,offer_id)
);
CREATE TABLE IF NOT EXISTS public.bot_catalog_products (
 bot_id uuid NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
 product_id uuid NOT NULL REFERENCES public.catalog_products(id) ON DELETE CASCADE,
 client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 sort_order integer NOT NULL DEFAULT 0, custom_label text, PRIMARY KEY(bot_id,product_id)
);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['bot_commerce_config','bot_booking_services','bot_booking_offers','bot_catalog_products'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('DROP POLICY IF EXISTS tenant_read ON public.%I',t);
  EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING(client_id=auth.uid())',t);
 END LOOP;
END $$;

-- Save the config and all assignments atomically so an interrupted request can
-- never leave a bot with half of its catalogue removed.
CREATE OR REPLACE FUNCTION public.save_bot_commerce_config(
 p_client uuid,p_bot uuid,p_config jsonb,
 p_service_ids uuid[] DEFAULT '{}',p_offer_ids uuid[] DEFAULT '{}',p_product_ids uuid[] DEFAULT '{}'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM bots WHERE id=p_bot AND client_id=p_client) THEN RAISE EXCEPTION 'Bot not found'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_service_ids) x(value) WHERE NOT EXISTS(SELECT 1 FROM booking_services s WHERE s.id=x.value AND s.client_id=p_client)) THEN RAISE EXCEPTION 'Invalid service assignment'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_offer_ids) x(value) WHERE NOT EXISTS(SELECT 1 FROM booking_offers o WHERE o.id=x.value AND o.client_id=p_client)) THEN RAISE EXCEPTION 'Invalid offer assignment'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_product_ids) x(value) WHERE NOT EXISTS(SELECT 1 FROM catalog_products p WHERE p.id=x.value AND p.client_id=p_client)) THEN RAISE EXCEPTION 'Invalid product assignment'; END IF;
 INSERT INTO bot_commerce_config(bot_id,client_id,booking_enabled,ordering_enabled,show_catalog,allow_booking_management,allow_order_management,menu_title,booking_label,catalogue_label,updated_at)
 VALUES(p_bot,p_client,coalesce((p_config->>'booking_enabled')::boolean,true),coalesce((p_config->>'ordering_enabled')::boolean,true),coalesce((p_config->>'show_catalog')::boolean,true),coalesce((p_config->>'allow_booking_management')::boolean,true),coalesce((p_config->>'allow_order_management')::boolean,true),left(coalesce(nullif(p_config->>'menu_title',''),'How can I help?'),120),left(coalesce(nullif(p_config->>'booking_label',''),'Book an appointment'),120),left(coalesce(nullif(p_config->>'catalogue_label',''),'Browse products'),120),now())
 ON CONFLICT(bot_id) DO UPDATE SET booking_enabled=excluded.booking_enabled,ordering_enabled=excluded.ordering_enabled,show_catalog=excluded.show_catalog,allow_booking_management=excluded.allow_booking_management,allow_order_management=excluded.allow_order_management,menu_title=excluded.menu_title,booking_label=excluded.booking_label,catalogue_label=excluded.catalogue_label,updated_at=now();
 DELETE FROM bot_booking_services WHERE bot_id=p_bot;DELETE FROM bot_booking_offers WHERE bot_id=p_bot;DELETE FROM bot_catalog_products WHERE bot_id=p_bot;
 INSERT INTO bot_booking_services(bot_id,client_id,service_id,sort_order) SELECT p_bot,p_client,id,(ord-1)::integer FROM unnest(p_service_ids) WITH ORDINALITY x(id,ord);
 INSERT INTO bot_booking_offers(bot_id,client_id,offer_id,sort_order) SELECT p_bot,p_client,id,(ord-1)::integer FROM unnest(p_offer_ids) WITH ORDINALITY x(id,ord);
 INSERT INTO bot_catalog_products(bot_id,client_id,product_id,sort_order) SELECT p_bot,p_client,id,(ord-1)::integer FROM unnest(p_product_ids) WITH ORDINALITY x(id,ord);
END $$;
REVOKE ALL ON FUNCTION public.save_bot_commerce_config(uuid,uuid,jsonb,uuid[],uuid[],uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_bot_commerce_config(uuid,uuid,jsonb,uuid[],uuid[],uuid[]) TO service_role;

-- Preserve existing Manual FAQ content as ordinary Knowledge Bases. The old
-- rows remain archived for rollback, but new runtime/UI management uses KBs.
DO $$ DECLARE q record; dataset uuid; target_bot uuid; BEGIN
 IF to_regclass('public.manual_qa_pairs') IS NULL THEN RETURN; END IF;
 FOR q IN SELECT * FROM public.manual_qa_pairs LOOP
  IF q.bot_id IS NULL THEN
   SELECT id INTO dataset FROM public.datasets WHERE client_id=q.client_id AND source_url='manual-faq://global' LIMIT 1;
   IF dataset IS NULL THEN
    INSERT INTO public.datasets(client_id,name,type,source_url,crawl_status,chunk_count,description,purpose,tags,status,source_count,created_from)
    VALUES(q.client_id,'Imported FAQs','manual','manual-faq://global','done',0,'Imported from Manual FAQ Overrides','support',ARRAY['faq','imported'],'ready',1,'faq_migration') RETURNING id INTO dataset;
   END IF;
   FOR target_bot IN SELECT id FROM public.bots WHERE client_id=q.client_id LOOP
    -- A bot with no explicit KB links previously fell back to every client
    -- dataset. Preserve that effective catalogue before adding the FAQ link.
    IF NOT EXISTS(SELECT 1 FROM public.bot_datasets bd WHERE bd.bot_id=target_bot) THEN
     INSERT INTO public.bot_datasets(bot_id,dataset_id)
     SELECT target_bot,d.id FROM public.datasets d WHERE d.client_id=q.client_id AND coalesce(d.created_from,'')<>'faq_migration'
     ON CONFLICT(bot_id,dataset_id) DO NOTHING;
    END IF;
    INSERT INTO public.bot_datasets(bot_id,dataset_id) VALUES(target_bot,dataset) ON CONFLICT(bot_id,dataset_id) DO NOTHING;
   END LOOP;
  ELSE
   SELECT id INTO dataset FROM public.datasets WHERE client_id=q.client_id AND source_url='manual-faq://bot/'||q.bot_id LIMIT 1;
   IF dataset IS NULL THEN
    INSERT INTO public.datasets(client_id,name,type,source_url,crawl_status,chunk_count,description,purpose,tags,status,source_count,created_from)
    VALUES(q.client_id,'Imported FAQs · '||(SELECT name FROM public.bots WHERE id=q.bot_id),'manual','manual-faq://bot/'||q.bot_id,'done',0,'Bot-specific FAQs imported from Manual FAQ Overrides','support',ARRAY['faq','imported','bot-specific'],'ready',1,'faq_migration') RETURNING id INTO dataset;
   END IF;
   IF NOT EXISTS(SELECT 1 FROM public.bot_datasets bd WHERE bd.bot_id=q.bot_id) THEN
    INSERT INTO public.bot_datasets(bot_id,dataset_id)
    SELECT q.bot_id,d.id FROM public.datasets d WHERE d.client_id=q.client_id AND coalesce(d.created_from,'')<>'faq_migration'
    ON CONFLICT(bot_id,dataset_id) DO NOTHING;
   END IF;
   INSERT INTO public.bot_datasets(bot_id,dataset_id) VALUES(q.bot_id,dataset) ON CONFLICT(bot_id,dataset_id) DO NOTHING;
  END IF;
  INSERT INTO public.chunks(id,dataset_id,title,text,chunk_hash,embedding,source_url,source_type,active)
  VALUES(q.id,dataset,'FAQ: '||left(q.question,180),'Question: '||q.question||E'\nAnswer: '||q.answer,md5(q.question||E'\n'||q.answer),q.question_embedding,'manual-faq://entry/'||q.id,'manual',q.is_active)
  ON CONFLICT(id) DO UPDATE SET dataset_id=excluded.dataset_id,title=excluded.title,text=excluded.text,chunk_hash=excluded.chunk_hash,embedding=excluded.embedding,active=excluded.active;
 END LOOP;
 UPDATE public.datasets d SET chunk_count=(SELECT count(*) FROM public.chunks c WHERE c.dataset_id=d.id),status='ready',updated_at=now() WHERE d.created_from='faq_migration';
END $$;

NOTIFY pgrst, 'reload schema';
