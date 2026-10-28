-- Lightweight, recipient-scoped in-app notifications.
-- Apply after 074_workspace_member_permissions.sql and the booking/commerce migrations.
BEGIN;

CREATE TABLE IF NOT EXISTS public.in_app_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 category text NOT NULL CHECK(category IN ('mine','tickets','orders')),
 event_type text NOT NULL,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 255),
 body text,
 entity_type text NOT NULL,
 entity_id uuid,
 action_url text NOT NULL DEFAULT '/',
 metadata jsonb NOT NULL DEFAULT '{}',
 group_key text,
 rollup_count integer NOT NULL DEFAULT 1 CHECK(rollup_count BETWEEN 1 AND 1000000),
 is_read boolean NOT NULL DEFAULT false,
 read_at timestamptz,
 snoozed_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS in_app_notifications_feed
 ON public.in_app_notifications(client_id,recipient_id,category,is_read,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS in_app_notifications_rollup
 ON public.in_app_notifications(client_id,recipient_id,group_key,created_at DESC)
 WHERE group_key IS NOT NULL AND is_read=false;

CREATE TABLE IF NOT EXISTS public.user_notification_settings (
 client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 dnd_until timestamptz,
 quiet_hours_enabled boolean NOT NULL DEFAULT false,
 quiet_hours_start time NOT NULL DEFAULT '20:00',
 quiet_hours_end time NOT NULL DEFAULT '08:00',
 timezone text NOT NULL DEFAULT 'Asia/Kolkata',
 toast_position text NOT NULL DEFAULT 'top-right' CHECK(toast_position IN ('top-right','bottom-right')),
 toast_duration_ms integer NOT NULL DEFAULT 5000 CHECK(toast_duration_ms IN (3000,5000,10000,0)),
 sound_enabled boolean NOT NULL DEFAULT true,
 browser_push_enabled boolean NOT NULL DEFAULT false,
 event_matrix jsonb NOT NULL DEFAULT '{
  "message.received":{"in_app":true,"toast":true,"sound":true},
  "ticket.raised":{"in_app":true,"toast":true,"sound":false},
  "ticket.assigned":{"in_app":true,"toast":true,"sound":true},
  "ticket.sla_breached":{"in_app":true,"toast":true,"sound":true},
  "booking.created":{"in_app":true,"toast":true,"sound":true},
  "order.created":{"in_app":true,"toast":true,"sound":true}
 }',
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(client_id,user_id)
);

ALTER TABLE public.in_app_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notification_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT,UPDATE ON public.in_app_notifications TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.user_notification_settings TO authenticated;
DROP POLICY IF EXISTS notification_recipient_read ON public.in_app_notifications;
CREATE POLICY notification_recipient_read ON public.in_app_notifications FOR SELECT TO authenticated
 USING(recipient_id=auth.uid() AND EXISTS(SELECT 1 FROM public.workspace_memberships m WHERE m.client_id=in_app_notifications.client_id AND m.user_id=auth.uid() AND m.status='active'));
DROP POLICY IF EXISTS notification_recipient_update ON public.in_app_notifications;
CREATE POLICY notification_recipient_update ON public.in_app_notifications FOR UPDATE TO authenticated
 USING(recipient_id=auth.uid()) WITH CHECK(recipient_id=auth.uid());
DROP POLICY IF EXISTS notification_settings_owner ON public.user_notification_settings;
CREATE POLICY notification_settings_owner ON public.user_notification_settings FOR ALL TO authenticated
 USING(user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.workspace_memberships m WHERE m.client_id=user_notification_settings.client_id AND m.user_id=auth.uid() AND m.status='active'))
 WITH CHECK(user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.workspace_memberships m WHERE m.client_id=user_notification_settings.client_id AND m.user_id=auth.uid() AND m.status='active'));

CREATE OR REPLACE FUNCTION public.notification_member_can(p_client uuid,p_user uuid,p_area text) RETURNS boolean
LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT EXISTS(
  SELECT 1 FROM public.workspace_memberships m
  WHERE m.client_id=p_client AND m.user_id=p_user AND m.status='active' AND (
   m.role_key IN ('owner','workspace_admin')
   OR coalesce(m.permissions->>p_area,'none') IN ('read','write')
   OR (m.permissions IS NULL AND (
    (p_area='tickets' AND m.role_key='agent')
    OR (p_area='bookings' AND m.role_key IN ('agent','booking_commerce_operator','analyst'))
    OR (p_area='orders' AND m.role_key IN ('agent','booking_commerce_operator','analyst'))
   ))
  )
 )
$$;

-- A 30-second update-in-place window prevents bursty chat traffic from creating
-- unbounded toast/feed rows. The function is only callable inside trusted DB code.
CREATE OR REPLACE FUNCTION public.emit_in_app_notification(
 p_client uuid,p_recipient uuid,p_category text,p_event_type text,p_title text,p_body text,
 p_entity_type text,p_entity_id uuid,p_action_url text,p_metadata jsonb DEFAULT '{}',p_group_key text DEFAULT NULL,p_actor uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existing_id uuid; output_id uuid;
BEGIN
 IF p_recipient IS NULL OR p_category NOT IN ('mine','tickets','orders') THEN RETURN NULL; END IF;
 IF EXISTS(
  SELECT 1 FROM user_notification_settings s
  WHERE s.client_id=p_client AND s.user_id=p_recipient
   AND lower(coalesce(s.event_matrix->p_event_type->>'in_app','true'))='false'
 ) THEN RETURN NULL; END IF;
 IF p_group_key IS NOT NULL THEN
  SELECT id INTO existing_id FROM in_app_notifications
  WHERE client_id=p_client AND recipient_id=p_recipient AND group_key=p_group_key AND is_read=false AND created_at>now()-interval '30 seconds'
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 END IF;
 IF existing_id IS NOT NULL THEN
  UPDATE in_app_notifications SET title=left(p_title,255),body=p_body,metadata=coalesce(metadata,'{}')||coalesce(p_metadata,'{}'),rollup_count=rollup_count+1,updated_at=now()
  WHERE id=existing_id RETURNING id INTO output_id;
 ELSE
  INSERT INTO in_app_notifications(client_id,recipient_id,actor_id,category,event_type,title,body,entity_type,entity_id,action_url,metadata,group_key)
  VALUES(p_client,p_recipient,p_actor,p_category,p_event_type,left(p_title,255),p_body,p_entity_type,p_entity_id,left(coalesce(p_action_url,'/'),512),coalesce(p_metadata,'{}'),left(p_group_key,160))
  RETURNING id INTO output_id;
 END IF;
 RETURN output_id;
END $$;
REVOKE ALL ON FUNCTION public.emit_in_app_notification(uuid,uuid,text,text,text,text,text,uuid,text,jsonb,text,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.notify_ticket_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE member record; number text:=coalesce(NEW.ticket_number,left(NEW.id::text,8));
BEGIN
 IF TG_OP='INSERT' THEN
  FOR member IN SELECT user_id FROM workspace_memberships WHERE client_id=NEW.client_id AND status='active' LOOP
   IF notification_member_can(NEW.client_id,member.user_id,'tickets') THEN
    PERFORM emit_in_app_notification(NEW.client_id,member.user_id,'tickets','ticket.raised','New ticket '||number,NEW.subject,'ticket',NEW.id,'/tickets/'||NEW.id,jsonb_build_object('priority',NEW.priority,'status',NEW.status),'ticket:'||NEW.id,NULL);
   END IF;
  END LOOP;
  IF NEW.assignee_id IS NOT NULL THEN
   PERFORM emit_in_app_notification(NEW.client_id,NEW.assignee_id,'mine','ticket.assigned','Ticket '||number||' assigned to you',NEW.subject,'ticket',NEW.id,'/tickets/'||NEW.id,jsonb_build_object('priority',NEW.priority),'ticket-assigned:'||NEW.id,NULL);
  END IF;
 ELSIF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id AND NEW.assignee_id IS NOT NULL THEN
  PERFORM emit_in_app_notification(NEW.client_id,NEW.assignee_id,'mine','ticket.assigned','Ticket '||number||' assigned to you',NEW.subject,'ticket',NEW.id,'/tickets/'||NEW.id,jsonb_build_object('priority',NEW.priority),'ticket-assigned:'||NEW.id,NULL);
 ELSIF NEW.sla_breached_at IS NOT NULL AND OLD.sla_breached_at IS NULL THEN
  FOR member IN SELECT user_id FROM workspace_memberships WHERE client_id=NEW.client_id AND status='active' LOOP
   IF notification_member_can(NEW.client_id,member.user_id,'tickets') THEN
    PERFORM emit_in_app_notification(NEW.client_id,member.user_id,CASE WHEN member.user_id=NEW.assignee_id THEN 'mine' ELSE 'tickets' END,'ticket.sla_breached','SLA breached for '||number,NEW.subject,'ticket',NEW.id,'/tickets/'||NEW.id,jsonb_build_object('priority',NEW.priority),'ticket-sla:'||NEW.id,NULL);
   END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_ticket_in_app ON public.tickets;
CREATE TRIGGER notify_ticket_in_app AFTER INSERT OR UPDATE OF assignee_id,sla_breached_at ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.notify_ticket_event();

CREATE OR REPLACE FUNCTION public.notify_booking_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE member record;
BEGIN
 FOR member IN SELECT user_id FROM workspace_memberships WHERE client_id=NEW.client_id AND status='active' LOOP
  IF notification_member_can(NEW.client_id,member.user_id,'bookings') THEN
   PERFORM emit_in_app_notification(NEW.client_id,member.user_id,'orders','booking.created','New booking '||NEW.reference,NEW.customer_name||' booked '||NEW.quantity||' place(s)','booking',NEW.id,'/features/bookings',jsonb_build_object('reference',NEW.reference,'slot_start',NEW.slot_start,'status',NEW.status),'booking:'||NEW.id,NULL);
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_booking_in_app ON public.feature_bookings;
CREATE TRIGGER notify_booking_in_app AFTER INSERT ON public.feature_bookings FOR EACH ROW EXECUTE FUNCTION public.notify_booking_event();

CREATE OR REPLACE FUNCTION public.notify_order_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE member record;
BEGIN
 FOR member IN SELECT user_id FROM workspace_memberships WHERE client_id=NEW.client_id AND status='active' LOOP
  IF notification_member_can(NEW.client_id,member.user_id,'orders') THEN
   PERFORM emit_in_app_notification(NEW.client_id,member.user_id,'orders','order.created','New order '||NEW.reference,NEW.customer_name||' placed an order for '||NEW.currency||' '||NEW.total,'order',NEW.id,'/features/commerce/orders',jsonb_build_object('reference',NEW.reference,'amount',NEW.total,'currency',NEW.currency,'status',NEW.status),'order:'||NEW.id,NULL);
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_order_in_app ON public.commerce_orders;
CREATE TRIGGER notify_order_in_app AFTER INSERT ON public.commerce_orders FOR EACH ROW EXECUTE FUNCTION public.notify_order_event();

CREATE OR REPLACE FUNCTION public.notify_assigned_message() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE conversation sessions; workspace uuid;
BEGIN
 IF NEW.role<>'user' THEN RETURN NEW; END IF;
 SELECT * INTO conversation FROM sessions WHERE session_id=NEW.session_id;
 IF conversation.assigned_agent_id IS NULL THEN RETURN NEW; END IF;
 workspace:=conversation.client_id;
 PERFORM emit_in_app_notification(workspace,conversation.assigned_agent_id,'mine','message.received','New customer message',left(NEW.content,240),'message',NEW.id,'/inbox?session='||NEW.session_id,jsonb_build_object('session_id',NEW.session_id),'message:'||NEW.session_id,NULL);
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_assigned_message_in_app ON public.messages;
CREATE TRIGGER notify_assigned_message_in_app AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.notify_assigned_message();

CREATE OR REPLACE FUNCTION public.prune_in_app_notifications(p_limit integer DEFAULT 5000) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE removed integer;
BEGIN
 WITH doomed AS (SELECT id FROM in_app_notifications WHERE created_at<now()-interval '90 days' ORDER BY created_at LIMIT least(greatest(p_limit,1),10000))
 DELETE FROM in_app_notifications n USING doomed d WHERE n.id=d.id;
 GET DIAGNOSTICS removed=ROW_COUNT;
 RETURN removed;
END $$;
REVOKE ALL ON FUNCTION public.prune_in_app_notifications(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prune_in_app_notifications(integer) TO service_role;

DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='in_app_notifications') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.in_app_notifications;
 END IF;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
