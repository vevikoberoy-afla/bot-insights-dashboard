-- Security baseline: bind API credentials to a single tenant and replace the
-- historical read-all authenticated policies on core multi-tenant tables.

ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_api_keys_client_id ON public.api_keys(client_id);

DROP POLICY IF EXISTS "Authenticated read bots" ON public.bots;
CREATE POLICY "Tenant read bots" ON public.bots FOR SELECT TO authenticated
  USING (client_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated read datasets" ON public.datasets;
CREATE POLICY "Tenant read datasets" ON public.datasets FOR SELECT TO authenticated
  USING (client_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated read bot_datasets" ON public.bot_datasets;
CREATE POLICY "Tenant read bot_datasets" ON public.bot_datasets FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bots b
      WHERE b.id = bot_datasets.bot_id AND b.client_id = auth.uid()
    )
  );

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant read own client" ON public.clients;
CREATE POLICY "Tenant read own client" ON public.clients FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Tenant update own client" ON public.clients;
CREATE POLICY "Tenant update own client" ON public.clients FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Authenticated read sessions" ON public.sessions;
CREATE POLICY "Tenant read sessions" ON public.sessions FOR SELECT TO authenticated
  USING (client_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated read handoff_requests" ON public.handoff_requests;
CREATE POLICY "Tenant read handoff requests" ON public.handoff_requests FOR SELECT TO authenticated
  USING (client_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated read tickets" ON public.tickets;
CREATE POLICY "Tenant read tickets" ON public.tickets FOR SELECT TO authenticated
  USING (client_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated read ticket_messages" ON public.ticket_messages;
CREATE POLICY "Tenant read ticket messages" ON public.ticket_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id AND t.client_id = auth.uid()));

DROP POLICY IF EXISTS "Authenticated read ticket_tags" ON public.ticket_tags;
CREATE POLICY "Tenant read ticket tags" ON public.ticket_tags FOR SELECT TO authenticated
  USING (client_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated read ticket_tag_mappings" ON public.ticket_tag_mappings;
CREATE POLICY "Tenant read ticket tag mappings" ON public.ticket_tag_mappings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id AND t.client_id = auth.uid()));

DROP POLICY IF EXISTS "Authenticated read campaigns" ON public.campaigns;
CREATE POLICY "Tenant read campaigns" ON public.campaigns FOR SELECT TO authenticated
  USING (client_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated read campaign_messages" ON public.campaign_messages;
CREATE POLICY "Tenant read campaign messages" ON public.campaign_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.client_id = auth.uid()));

DROP POLICY IF EXISTS "Authenticated read campaign_recipients" ON public.campaign_recipients;
CREATE POLICY "Tenant read campaign recipients" ON public.campaign_recipients FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.client_id = auth.uid()));

DROP POLICY IF EXISTS "Authenticated read templates" ON public.templates;
CREATE POLICY "Tenant read templates" ON public.templates FOR SELECT TO authenticated
  USING (client_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated read bot_channels" ON public.bot_channels;
CREATE POLICY "Tenant read bot channels" ON public.bot_channels FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bots b WHERE b.id = bot_id AND b.client_id = auth.uid()));

DROP POLICY IF EXISTS "Authenticated read feedback" ON public.feedback;
CREATE POLICY "Tenant read feedback" ON public.feedback FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bots b WHERE b.id = bot_id AND b.client_id = auth.uid()));

DROP POLICY IF EXISTS "Authenticated read dataset_sources" ON public.dataset_sources;
CREATE POLICY "Tenant read dataset sources" ON public.dataset_sources FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.datasets d WHERE d.id = dataset_id AND d.client_id = auth.uid()));

DROP POLICY IF EXISTS "Authenticated read database_sources" ON public.database_sources;
CREATE POLICY "Tenant read database sources" ON public.database_sources FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.data_sources d WHERE d.id = database_id AND d.client_id = auth.uid()));

DROP POLICY IF EXISTS "Authenticated read bot_databases" ON public.bot_databases;
CREATE POLICY "Tenant read bot databases" ON public.bot_databases FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bots b WHERE b.id = bot_id AND b.client_id = auth.uid()));

DROP POLICY IF EXISTS "Authenticated read subscriptions" ON public.subscriptions;
CREATE POLICY "Tenant read subscriptions" ON public.subscriptions FOR SELECT TO authenticated
  USING (client_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated read invoices" ON public.invoices;
CREATE POLICY "Tenant read invoices" ON public.invoices FOR SELECT TO authenticated
  USING (client_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated read notes" ON public.notes;
CREATE POLICY "Tenant read notes" ON public.notes FOR SELECT TO authenticated
  USING (client_id = auth.uid());
