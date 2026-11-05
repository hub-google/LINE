
-- HR-LINE-01..04: verified LINE identity links and retryable delivery ledger.
-- No credentials or channel tokens are stored in these tables.
CREATE TABLE IF NOT EXISTS public.wm_line_links(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.wm_tenants(id) ON DELETE CASCADE,
 member_id uuid NOT NULL,
 user_id uuid NOT NULL REFERENCES auth.users(id),
 line_sub text NOT NULL CHECK(line_sub~'^U[0-9a-fA-F]{32}$'),
 login_channel_id text NOT NULL CHECK(login_channel_id~'^[0-9]{8,}$'),
 mode text NOT NULL DEFAULT 'platform' CHECK(mode IN('platform','merchant')),
 verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 revoked_at timestamptz,
 UNIQUE(tenant_id,member_id),
 FOREIGN KEY(tenant_id,member_id) REFERENCES public.wm_members(tenant_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS wm_line_links_channel_subject_active ON public.wm_line_links
 (tenant_id,login_channel_id,line_sub) WHERE revoked_at IS NULL;
ALTER TABLE public.wm_line_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wm_line_links FROM anon,authenticated;
GRANT SELECT ON public.wm_line_links TO authenticated;
CREATE POLICY wm_line_link_self ON public.wm_line_links FOR SELECT TO authenticated
 USING(user_id=auth.uid() OR wm_private.my_role(tenant_id) IN('owner','hr'));
CREATE TABLE IF NOT EXISTS public.wm_line_deliveries(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.wm_tenants(id) ON DELETE CASCADE,
 notification_id uuid NOT NULL REFERENCES public.wm_notifications(id) ON DELETE CASCADE,
 member_id uuid NOT NULL,
 mode text NOT NULL DEFAULT 'platform' CHECK(mode IN('platform','merchant')),
 status text NOT NULL DEFAULT 'pending'
 CHECK(status IN('pending','sending','sent','failed','skipped')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 10),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 last_error_code text,
 sent_at timestamptz,
 last_attempt_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(notification_id,mode),
 FOREIGN KEY(tenant_id,member_id) REFERENCES public.wm_members(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS wm_line_pending_idx ON public.wm_line_deliveries(status,next_attempt_at)
 WHERE status IN('pending','failed');
ALTER TABLE public.wm_line_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wm_line_deliveries FROM anon,authenticated;
GRANT SELECT ON public.wm_line_deliveries TO authenticated;
CREATE POLICY wm_line_deliveries_read ON public.wm_line_deliveries FOR SELECT TO authenticated
 USING(wm_private.my_role(tenant_id) IN('owner','hr') OR EXISTS(
 SELECT 1 FROM public.wm_members m WHERE m.id=member_id AND m.tenant_id=wm_line_deliveries.tenant_id
 AND m.user_id=auth.uid() AND m.status='active'));

CREATE OR REPLACE FUNCTION wm_private.queue_workforce_line_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_mode text;
BEGIN
 SELECT mode INTO v_mode FROM public.wm_line_links l
 WHERE l.tenant_id=new.tenant_id AND l.member_id=new.recipient_member_id
  AND l.revoked_at IS NULL LIMIT 1;
 IF v_mode IS NULL THEN RETURN new;END IF;
 INSERT INTO public.wm_line_deliveries(tenant_id,notification_id,member_id,mode)
 VALUES(new.tenant_id,new.id,new.recipient_member_id,v_mode)
 ON CONFLICT(notification_id,mode) DO NOTHING;
 RETURN new;
END $fn$;
DROP TRIGGER IF EXISTS wm_line_event_enqueue ON public.wm_notifications;
CREATE TRIGGER wm_line_event_enqueue AFTER INSERT ON public.wm_notifications
 FOR EACH ROW EXECUTE FUNCTION wm_private.queue_workforce_line_event();

CREATE OR REPLACE FUNCTION public.wm_line_delivery_status(p_tenant uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF auth.uid() IS NULL OR wm_private.my_role(p_tenant) NOT IN('owner','hr') THEN
  RAISE EXCEPTION '只有企業負責人與人資可查詢通知費用及發送統計' USING errcode='42501';END IF;
 RETURN jsonb_build_object(
 'linked',(SELECT count(*) FROM public.wm_line_links WHERE tenant_id=p_tenant AND revoked_at IS NULL),
 'pending',(SELECT count(*) FROM public.wm_line_deliveries WHERE tenant_id=p_tenant AND status IN('pending','failed')),
 'sent',(SELECT count(*) FROM public.wm_line_deliveries WHERE tenant_id=p_tenant AND status='sent'),
 'skipped',(SELECT count(*) FROM public.wm_line_deliveries WHERE tenant_id=p_tenant AND status='skipped'));
END $fn$;
REVOKE ALL ON FUNCTION public.wm_line_delivery_status(uuid) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.wm_line_delivery_status(uuid) TO authenticated;
REVOKE ALL ON FUNCTION wm_private.queue_workforce_line_event() FROM public,anon,authenticated;
NOTIFY pgrst,'reload schema';
