-- Reproducible additive workforce PRD migration, derived from deployed Supabase objects.
-- Apply after the four original workforce migrations.

CREATE TABLE IF NOT EXISTS public.wm_departments (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  branch_id uuid not null,
  name text not null,
  created_at timestamp with time zone default now() not null,
  constraint wm_departments_name_check CHECK (char_length(TRIM(BOTH FROM name)) >= 1 AND char_length(TRIM(BOTH FROM name)) <= 80),
  constraint wm_departments_pkey PRIMARY KEY (id),
  constraint wm_departments_tenant_id_branch_id_fkey FOREIGN KEY (tenant_id, branch_id) REFERENCES wm_branches(tenant_id, id),
  constraint wm_departments_tenant_id_branch_id_name_key UNIQUE (tenant_id, branch_id, name),
  constraint wm_departments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES wm_tenants(id) ON DELETE CASCADE,
  constraint wm_departments_tenant_id_id_key UNIQUE (tenant_id, id)
);
ALTER TABLE public.wm_departments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wm_departments FROM anon,authenticated;
DROP POLICY IF EXISTS wm_departments_manage ON public.wm_departments;
CREATE POLICY wm_departments_manage ON public.wm_departments FOR ALL TO authenticated USING (wm_private.can_manage(tenant_id)) WITH CHECK (wm_private.can_manage(tenant_id));
DROP POLICY IF EXISTS wm_departments_read ON public.wm_departments;
CREATE POLICY wm_departments_read ON public.wm_departments FOR SELECT TO authenticated USING ((wm_private.my_role(tenant_id) IS NOT NULL));
CREATE UNIQUE INDEX IF NOT EXISTS wm_departments_tenant_id_id_key ON public.wm_departments USING btree (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS wm_departments_tenant_id_branch_id_name_key ON public.wm_departments USING btree (tenant_id, branch_id, name);

CREATE TABLE IF NOT EXISTS public.wm_invites (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  member_id uuid not null,
  token_digest text not null,
  expires_at timestamp with time zone default (now() + '7 days'::interval) not null,
  accepted_at timestamp with time zone,
  created_by uuid not null,
  created_at timestamp with time zone default now() not null,
  constraint wm_invites_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
  constraint wm_invites_pkey PRIMARY KEY (id),
  constraint wm_invites_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES wm_tenants(id) ON DELETE CASCADE,
  constraint wm_invites_tenant_id_member_id_fkey FOREIGN KEY (tenant_id, member_id) REFERENCES wm_members(tenant_id, id),
  constraint wm_invites_token_digest_key UNIQUE (token_digest)
);
ALTER TABLE public.wm_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wm_invites FROM anon,authenticated;
CREATE UNIQUE INDEX IF NOT EXISTS wm_invites_token_digest_key ON public.wm_invites USING btree (token_digest);
CREATE INDEX IF NOT EXISTS wm_invites_member ON public.wm_invites USING btree (tenant_id, member_id);

CREATE TABLE IF NOT EXISTS public.wm_notifications (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  recipient_member_id uuid not null,
  event_key text not null,
  title text not null,
  body text default ''::text not null,
  created_at timestamp with time zone default now() not null,
  read_at timestamp with time zone,
  constraint wm_notifications_pkey PRIMARY KEY (id),
  constraint wm_notifications_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES wm_tenants(id) ON DELETE CASCADE,
  constraint wm_notifications_tenant_id_recipient_member_id_event_key_key UNIQUE (tenant_id, recipient_member_id, event_key),
  constraint wm_notifications_tenant_id_recipient_member_id_fkey FOREIGN KEY (tenant_id, recipient_member_id) REFERENCES wm_members(tenant_id, id)
);
ALTER TABLE public.wm_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wm_notifications FROM anon,authenticated;
DROP POLICY IF EXISTS wm_notifications_read ON public.wm_notifications;
CREATE POLICY wm_notifications_read ON public.wm_notifications FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM wm_members m
  WHERE ((m.id = wm_notifications.recipient_member_id) AND (m.tenant_id = wm_notifications.tenant_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.status = 'active'::text)))));
CREATE UNIQUE INDEX IF NOT EXISTS wm_notifications_tenant_id_recipient_member_id_event_key_key ON public.wm_notifications USING btree (tenant_id, recipient_member_id, event_key);
CREATE INDEX IF NOT EXISTS wm_notifications_inbox ON public.wm_notifications USING btree (tenant_id, recipient_member_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.wm_period_adjustments (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  closure_id uuid not null,
  member_id uuid not null,
  minutes_delta integer not null,
  reason text not null,
  adjusted_by uuid not null,
  created_at timestamp with time zone default now() not null,
  constraint wm_period_adjustments_adjusted_by_fkey FOREIGN KEY (adjusted_by) REFERENCES auth.users(id),
  constraint wm_period_adjustments_closure_id_fkey FOREIGN KEY (closure_id) REFERENCES wm_period_closures(id),
  constraint wm_period_adjustments_minutes_delta_check CHECK (abs(minutes_delta) <= 43200),
  constraint wm_period_adjustments_pkey PRIMARY KEY (id),
  constraint wm_period_adjustments_reason_check CHECK (length(TRIM(BOTH FROM reason)) >= 3 AND length(TRIM(BOTH FROM reason)) <= 500),
  constraint wm_period_adjustments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES wm_tenants(id),
  constraint wm_period_adjustments_tenant_id_member_id_fkey FOREIGN KEY (tenant_id, member_id) REFERENCES wm_members(tenant_id, id)
);
ALTER TABLE public.wm_period_adjustments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wm_period_adjustments FROM anon,authenticated;
DROP POLICY IF EXISTS wm_adjustments_read ON public.wm_period_adjustments;
CREATE POLICY wm_adjustments_read ON public.wm_period_adjustments FOR SELECT TO authenticated USING (wm_private.can_manage(tenant_id));

CREATE TABLE IF NOT EXISTS public.wm_period_closures (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  year integer not null,
  month integer not null,
  status text default 'closed'::text not null,
  snapshot jsonb not null,
  closed_by uuid not null,
  closed_at timestamp with time zone default clock_timestamp() not null,
  constraint wm_period_closures_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES auth.users(id),
  constraint wm_period_closures_month_check CHECK (month >= 1 AND month <= 12),
  constraint wm_period_closures_pkey PRIMARY KEY (id),
  constraint wm_period_closures_status_check CHECK (status = 'closed'::text),
  constraint wm_period_closures_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES wm_tenants(id) ON DELETE CASCADE,
  constraint wm_period_closures_tenant_id_year_month_key UNIQUE (tenant_id, year, month),
  constraint wm_period_closures_year_check CHECK (year >= 2000 AND year <= 2150)
);
ALTER TABLE public.wm_period_closures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wm_period_closures FROM anon,authenticated;
DROP POLICY IF EXISTS wm_period_read ON public.wm_period_closures;
CREATE POLICY wm_period_read ON public.wm_period_closures FOR SELECT TO authenticated USING (wm_private.can_manage(tenant_id));
CREATE UNIQUE INDEX IF NOT EXISTS wm_period_closures_tenant_id_year_month_key ON public.wm_period_closures USING btree (tenant_id, year, month);

CREATE TABLE IF NOT EXISTS public.wm_shift_templates (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  name text not null,
  starts_local time without time zone not null,
  ends_local time without time zone not null,
  break_minutes integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  constraint wm_shift_templates_break_minutes_check CHECK (break_minutes >= 0 AND break_minutes <= 240),
  constraint wm_shift_templates_name_check CHECK (length(TRIM(BOTH FROM name)) >= 1 AND length(TRIM(BOTH FROM name)) <= 80),
  constraint wm_shift_templates_pkey PRIMARY KEY (id),
  constraint wm_shift_templates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES wm_tenants(id) ON DELETE CASCADE,
  constraint wm_shift_templates_tenant_id_id_key UNIQUE (tenant_id, id),
  constraint wm_shift_templates_tenant_id_name_key UNIQUE (tenant_id, name)
);
ALTER TABLE public.wm_shift_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wm_shift_templates FROM anon,authenticated;
DROP POLICY IF EXISTS wm_shift_templates_manage ON public.wm_shift_templates;
CREATE POLICY wm_shift_templates_manage ON public.wm_shift_templates FOR ALL TO authenticated USING (wm_private.can_manage(tenant_id)) WITH CHECK (wm_private.can_manage(tenant_id));
DROP POLICY IF EXISTS wm_shift_templates_read ON public.wm_shift_templates;
CREATE POLICY wm_shift_templates_read ON public.wm_shift_templates FOR SELECT TO authenticated USING ((wm_private.my_role(tenant_id) IS NOT NULL));
CREATE UNIQUE INDEX IF NOT EXISTS wm_shift_templates_tenant_id_id_key ON public.wm_shift_templates USING btree (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS wm_shift_templates_tenant_id_name_key ON public.wm_shift_templates USING btree (tenant_id, name);

CREATE TABLE IF NOT EXISTS public.wm_staffing_requirements (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  branch_id uuid not null,
  weekday integer not null,
  starts_local time without time zone not null,
  ends_local time without time zone not null,
  needed integer not null,
  created_at timestamp with time zone default now() not null,
  constraint wm_staffing_requirements_needed_check CHECK (needed >= 1 AND needed <= 100),
  constraint wm_staffing_requirements_pkey PRIMARY KEY (id),
  constraint wm_staffing_requirements_tenant_id_branch_id_fkey FOREIGN KEY (tenant_id, branch_id) REFERENCES wm_branches(tenant_id, id),
  constraint wm_staffing_requirements_tenant_id_branch_id_weekday_starts_key UNIQUE (tenant_id, branch_id, weekday, starts_local, ends_local),
  constraint wm_staffing_requirements_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES wm_tenants(id) ON DELETE CASCADE,
  constraint wm_staffing_requirements_weekday_check CHECK (weekday >= 0 AND weekday <= 6)
);
ALTER TABLE public.wm_staffing_requirements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wm_staffing_requirements FROM anon,authenticated;
DROP POLICY IF EXISTS wm_requirements_manage ON public.wm_staffing_requirements;
CREATE POLICY wm_requirements_manage ON public.wm_staffing_requirements FOR ALL TO authenticated USING (wm_private.can_manage(tenant_id)) WITH CHECK (wm_private.can_manage(tenant_id));
DROP POLICY IF EXISTS wm_requirements_read ON public.wm_staffing_requirements;
CREATE POLICY wm_requirements_read ON public.wm_staffing_requirements FOR SELECT TO authenticated USING ((wm_private.my_role(tenant_id) IS NOT NULL));
CREATE UNIQUE INDEX IF NOT EXISTS wm_staffing_requirements_tenant_id_branch_id_weekday_starts_key ON public.wm_staffing_requirements USING btree (tenant_id, branch_id, weekday, starts_local, ends_local);

ALTER TABLE public.wm_members ADD COLUMN IF NOT EXISTS department_id uuid;
ALTER TABLE public.wm_members ADD COLUMN IF NOT EXISTS hourly_rate numeric(12,2);
ALTER TABLE public.wm_members ADD COLUMN IF NOT EXISTS hired_on date;
ALTER TABLE public.wm_members ADD COLUMN IF NOT EXISTS left_on date;
ALTER TABLE public.wm_members ADD COLUMN IF NOT EXISTS skills text[] NOT NULL DEFAULT '{}'::text[];
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='wm_member_department_fk') THEN ALTER TABLE public.wm_members ADD CONSTRAINT wm_member_department_fk FOREIGN KEY(tenant_id,department_id) REFERENCES public.wm_departments(tenant_id,id); END IF;
IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='wm_hourly_rate_valid') THEN ALTER TABLE public.wm_members ADD CONSTRAINT wm_hourly_rate_valid CHECK(hourly_rate IS NULL OR hourly_rate>=0); END IF; END $$;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.wm_departments,public.wm_shift_templates,public.wm_staffing_requirements TO authenticated;
GRANT SELECT ON public.wm_period_closures,public.wm_period_adjustments,public.wm_notifications TO authenticated;

CREATE OR REPLACE FUNCTION wm_private.on_shift_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if new.status='published' and (tg_op='INSERT' or old.status is distinct from new.status or
    old.starts_at is distinct from new.starts_at or old.ends_at is distinct from new.ends_at) then
   insert into public.wm_notifications(tenant_id,recipient_member_id,event_key,title,body)
   values(new.tenant_id,new.member_id,'shift:published:'||new.id||':'||new.updated_at::text,
   '班表已發布或變更','請開啟我的班表確認工作時間。')
   on conflict do nothing;
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION wm_private.on_workforce_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_member public.wm_members%rowtype;
begin
 if tg_op='INSERT' then
  for v_member in select * from public.wm_members where tenant_id=new.tenant_id and role in ('owner','hr','manager') and status='active' loop
   insert into public.wm_notifications(tenant_id,recipient_member_id,event_key,title,body)
   values(new.tenant_id,v_member.id,'request:new:'||new.id,'待審核假勤申請','新申請已送出，請前往審核中心。')
   on conflict do nothing;
  end loop;
 elsif tg_op='UPDATE' and new.status is distinct from old.status then
  insert into public.wm_notifications(tenant_id,recipient_member_id,event_key,title,body)
  values(new.tenant_id,new.member_id,'request:status:'||new.id||':'||new.status,'申請狀態已更新',
   case new.status when 'approved' then '申請已核准' when 'rejected' then '申請已駁回'
   when 'withdrawn' then '申請已撤回' else new.status end)
  on conflict do nothing;
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.wm_accept_invite(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_invite public.wm_invites%rowtype;v_member public.wm_members%rowtype;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
  raise exception '請先以正式帳號登入'; end if;
 if p_token is null or p_token !~ '^[0-9a-f]{48}$' then raise exception '無效的邀請憑證';end if;
 select * into v_invite from public.wm_invites
 where token_digest=encode(extensions.digest(p_token,'sha256'),'hex') for update;
 if not found or v_invite.accepted_at is not null or v_invite.expires_at<=now() then
  raise exception '邀請已失效或已被使用';end if;
 select * into v_member from public.wm_members where id=v_invite.member_id and tenant_id=v_invite.tenant_id for update;
 if v_member.status<>'active' or v_member.user_id is not null then raise exception '邀請員工已綁定或已離職';end if;
 if exists(select 1 from public.wm_members where tenant_id=v_invite.tenant_id and user_id=auth.uid()) then
  raise exception '帳號已屬於此企業';end if;
 update public.wm_members set user_id=auth.uid() where id=v_member.id;
 update public.wm_invites set accepted_at=clock_timestamp() where id=v_invite.id;
 insert into public.wm_audit(tenant_id,actor_id,action,target_type,target_id)
 values(v_invite.tenant_id,auth.uid(),'invite_accepted','member',v_member.id);
 return jsonb_build_object('tenant_id',v_invite.tenant_id,'member_id',v_member.id,'name',v_member.display_name);
end $function$;

CREATE OR REPLACE FUNCTION public.wm_create_invite(p_tenant uuid, p_member uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_token text;
begin
 if auth.uid() is null or not wm_private.is_owner(p_tenant) then raise exception '只有企業擁有者可以邀請員工' using errcode='42501';end if;
 if coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception '請登入正式帳號'; end if;
 if not exists(select 1 from public.wm_members where tenant_id=p_tenant and id=p_member and user_id is null and status='active') then
  raise exception '此員工已綁定帳號，或不屬於本企業'; end if;
 v_token:=encode(extensions.gen_random_bytes(24),'hex');
 insert into public.wm_invites(tenant_id,member_id,token_digest,created_by)
 values(p_tenant,p_member,encode(extensions.digest(v_token,'sha256'),'hex'),auth.uid());
 insert into public.wm_audit(tenant_id,actor_id,action,target_type,target_id)
 values(p_tenant,auth.uid(),'invite_created','member',p_member);
 return v_token;
end $function$;

CREATE OR REPLACE FUNCTION public.wm_mark_notification_read(p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid;
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 update public.wm_notifications n set read_at=clock_timestamp()
 where n.id=p_id and exists(
  select 1 from public.wm_members m where m.tenant_id=n.tenant_id and m.id=n.recipient_member_id and m.user_id=auth.uid() and m.status='active')
 returning n.id into v_id;
 return v_id is not null;
end $function$;

CREATE OR REPLACE FUNCTION public.wm_read_invites(p_tenant uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select case when wm_private.is_owner(p_tenant) then
  coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'member_id',i.member_id,'expires_at',i.expires_at,'accepted_at',i.accepted_at,'created_at',i.created_at) order by i.created_at desc)
  from (select * from public.wm_invites where tenant_id=p_tenant order by created_at desc limit 100) i),'[]'::jsonb)
 else '[]'::jsonb end;
$function$;
REVOKE ALL ON FUNCTION public.wm_create_invite(uuid,uuid) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.wm_create_invite(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.wm_accept_invite(text) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.wm_accept_invite(text) TO authenticated;
REVOKE ALL ON FUNCTION public.wm_read_invites(uuid) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.wm_read_invites(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.wm_mark_notification_read(uuid) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.wm_mark_notification_read(uuid) TO authenticated;
DROP TRIGGER IF EXISTS wm_notify_request ON public.wm_requests;
CREATE TRIGGER wm_notify_request AFTER INSERT OR UPDATE OF status ON public.wm_requests FOR EACH ROW EXECUTE FUNCTION wm_private.on_workforce_request();
DROP TRIGGER IF EXISTS wm_notify_shift ON public.wm_shifts;
CREATE TRIGGER wm_notify_shift AFTER INSERT OR UPDATE ON public.wm_shifts FOR EACH ROW EXECUTE FUNCTION wm_private.on_shift_notification();
