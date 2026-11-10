-- Queue Monster: leave one merchant without deleting the person's account,
-- preserve historical merchant data on dissolve, and enforce manager continuity.
ALTER TABLE public.so_tenants DROP CONSTRAINT IF EXISTS so_tenants_status_check;
ALTER TABLE public.so_tenants ADD CONSTRAINT so_tenants_status_check
  CHECK (status = ANY (ARRAY['ACTIVE'::text,'SUSPENDED'::text,'DISSOLVED'::text]));

CREATE TABLE IF NOT EXISTS public.so_membership_exits (
  tenant_id uuid NOT NULL REFERENCES public.so_tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exited_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL CHECK (reason IN ('LEFT','DISSOLVED')),
  PRIMARY KEY (tenant_id,user_id)
);
ALTER TABLE public.so_membership_exits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.so_membership_exits FROM PUBLIC,anon,authenticated;
-- Only the security-definer RPCs write exit history; it is not public client data.

CREATE OR REPLACE FUNCTION private.so_guard_membership_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $guard$
DECLARE
 v_status text;
 v_count int;
 v_managers int;
BEGIN
 IF TG_OP='UPDATE' AND NEW.tenant_id<>OLD.tenant_id THEN
   RAISE EXCEPTION '無法跨店移動員工角色' USING errcode='42501';
 END IF;
 SELECT status INTO v_status FROM public.so_tenants WHERE id=OLD.tenant_id;
 IF v_status IS NULL OR v_status='DISSOLVED' THEN
   RETURN COALESCE(NEW,OLD);
 END IF;
 SELECT count(*), count(*) FILTER (WHERE role IN ('OWNER','MANAGER'))
 INTO v_count,v_managers
 FROM public.so_members WHERE tenant_id=OLD.tenant_id;
 IF v_count=0 THEN
   RAISE EXCEPTION '店家最後一位成員不能直接退出，請由管理者解散店家' USING errcode='23514';
 END IF;
 IF v_managers=0 THEN
   RAISE EXCEPTION '店家至少必須保留一位管理者，請先指定其他管理者' USING errcode='23514';
 END IF;
 RETURN COALESCE(NEW,OLD);
END
$guard$;
DROP TRIGGER IF EXISTS so_guard_membership_admin ON public.so_members;
CREATE TRIGGER so_guard_membership_admin
AFTER DELETE OR UPDATE OF role ON public.so_members
FOR EACH ROW EXECUTE FUNCTION private.so_guard_membership_admin();

CREATE OR REPLACE FUNCTION private.so_guard_dissolved_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $guard$
BEGIN
 IF OLD.status='DISSOLVED' AND NEW.status<>'DISSOLVED' THEN
   RAISE EXCEPTION '已解散店家不可重新開通' USING errcode='23514';
 END IF;
 RETURN NEW;
END
$guard$;
DROP TRIGGER IF EXISTS so_guard_dissolved_tenant ON public.so_tenants;
CREATE TRIGGER so_guard_dissolved_tenant
BEFORE UPDATE OF status ON public.so_tenants
FOR EACH ROW EXECUTE FUNCTION private.so_guard_dissolved_tenant();

CREATE OR REPLACE FUNCTION public.so_leave_tenant(p_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $leave$
DECLARE
 t public.so_tenants%rowtype;
 me public.so_members%rowtype;
 v_count int;
 v_managers int;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION '請先登入' USING errcode='28000'; END IF;
 SELECT * INTO t FROM public.so_tenants WHERE slug=p_slug FOR UPDATE;
 IF NOT FOUND OR t.status='DISSOLVED' THEN RAISE EXCEPTION '店家不存在或已解散' USING errcode='22023'; END IF;
 SELECT * INTO me FROM public.so_members
 WHERE tenant_id=t.id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '你尚未加入這家店' USING errcode='42501'; END IF;
 SELECT count(*),count(*) FILTER (WHERE role IN ('OWNER','MANAGER'))
 INTO v_count,v_managers FROM public.so_members WHERE tenant_id=t.id;
 IF v_count<=1 THEN
   RAISE EXCEPTION '你是店家最後一位成員，不能直接退出；請選擇解散店家' USING errcode='23514';
 END IF;
 IF me.role IN ('OWNER','MANAGER') AND v_managers<=1 THEN
   RAISE EXCEPTION '你是店家唯一管理者，請先將其他成員設為管理者再退出' USING errcode='23514';
 END IF;
 INSERT INTO public.so_membership_exits(tenant_id,user_id,exited_at,reason)
 VALUES(t.id,auth.uid(),now(),'LEFT')
 ON CONFLICT(tenant_id,user_id) DO UPDATE SET exited_at=now(),reason='LEFT';
 DELETE FROM public.so_members WHERE tenant_id=t.id AND user_id=auth.uid();
 RETURN jsonb_build_object('left',true,'slug',t.slug,'remaining',v_count-1);
END
$leave$;
REVOKE ALL ON FUNCTION public.so_leave_tenant(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.so_leave_tenant(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.so_dissolve_tenant(p_slug text,p_confirm_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $dissolve$
DECLARE
 t public.so_tenants%rowtype;
 v_role text;
 v_members int;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION '請先登入' USING errcode='28000'; END IF;
 SELECT * INTO t FROM public.so_tenants WHERE slug=p_slug FOR UPDATE;
 IF NOT FOUND OR t.status='DISSOLVED' THEN RAISE EXCEPTION '店家不存在或已解散' USING errcode='22023'; END IF;
 SELECT role INTO v_role FROM public.so_members
 WHERE tenant_id=t.id AND user_id=auth.uid() FOR UPDATE;
 IF v_role NOT IN ('OWNER','MANAGER') OR v_role IS NULL THEN
   RAISE EXCEPTION '僅店家管理者可以解散店家' USING errcode='42501';
 END IF;
 IF p_confirm_name IS DISTINCT FROM t.name THEN
   RAISE EXCEPTION '請輸入完整店名以確認解散' USING errcode='22023';
 END IF;
 -- Soft-close FIRST so last-member trigger can permit a complete disband.
 UPDATE public.so_tenants
 SET status='DISSOLVED',directory_enabled=false,updated_at=now()
 WHERE id=t.id;
 INSERT INTO public.so_membership_exits(tenant_id,user_id,exited_at,reason)
 SELECT tenant_id,user_id,now(),'DISSOLVED' FROM public.so_members WHERE tenant_id=t.id
 ON CONFLICT(tenant_id,user_id) DO UPDATE SET exited_at=now(),reason='DISSOLVED';
 SELECT count(*) INTO v_members FROM public.so_members WHERE tenant_id=t.id;
 DELETE FROM public.so_members WHERE tenant_id=t.id;
 DELETE FROM public.so_invites WHERE tenant_id=t.id AND accepted_at IS NULL;
 RETURN jsonb_build_object('dissolved',true,'slug',t.slug,'removed_members',v_members);
END
$dissolve$;
REVOKE ALL ON FUNCTION public.so_dissolve_tenant(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.so_dissolve_tenant(text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.so_promote_tenant_manager(p_slug text,p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $promote$
DECLARE
 t public.so_tenants%rowtype;
 v_role text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION '請先登入' USING errcode='28000'; END IF;
 SELECT * INTO t FROM public.so_tenants WHERE slug=p_slug FOR UPDATE;
 IF NOT FOUND OR t.status='DISSOLVED' THEN RAISE EXCEPTION '店家不存在或已解散' USING errcode='22023'; END IF;
 SELECT role INTO v_role FROM public.so_members
 WHERE tenant_id=t.id AND user_id=auth.uid();
 IF v_role NOT IN ('OWNER','MANAGER') OR v_role IS NULL THEN
   RAISE EXCEPTION '只有管理者可以指定其他管理者' USING errcode='42501';
 END IF;
 UPDATE public.so_members SET role='MANAGER'
 WHERE tenant_id=t.id AND user_id=p_user_id AND role='STAFF';
 IF NOT FOUND THEN RAISE EXCEPTION '此員工已非一般員工，或未加入這家店' USING errcode='22023'; END IF;
 RETURN jsonb_build_object('promoted',true);
END
$promote$;
REVOKE ALL ON FUNCTION public.so_promote_tenant_manager(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.so_promote_tenant_manager(text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.so_my_context()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $context$
DECLARE v_user uuid:=auth.uid(); v_email text;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION '請先登入' USING errcode='28000'; END IF;
 SELECT lower(email) INTO v_email FROM auth.users WHERE id=v_user AND email_confirmed_at IS NOT NULL;
 RETURN jsonb_build_object(
  'platform_admin',private.so_platform(),
  'previous_member',EXISTS(SELECT 1 FROM public.so_membership_exits WHERE user_id=v_user)
    OR EXISTS(SELECT 1 FROM public.so_invites WHERE accepted_by=v_user),
  'memberships',COALESCE((
   SELECT jsonb_agg(jsonb_build_object(
     'slug',t.slug,'name',t.name,'role',m.role,'id',t.id,'status',t.status,
     'member_count',(SELECT count(*) FROM public.so_members c WHERE c.tenant_id=t.id),
     'manager_count',(SELECT count(*) FROM public.so_members c WHERE c.tenant_id=t.id AND c.role IN ('OWNER','MANAGER'))
   ) ORDER BY t.name)
   FROM public.so_members m JOIN public.so_tenants t ON t.id=m.tenant_id
   WHERE m.user_id=v_user AND t.status<>'DISSOLVED'
  ),'[]'::jsonb),
  'invitations',COALESCE((
   SELECT jsonb_agg(jsonb_build_object('id',i.id,'tenant',t.name,'slug',t.slug,'role',i.role))
   FROM public.so_invites i JOIN public.so_tenants t ON t.id=i.tenant_id
   WHERE lower(i.email)=v_email AND i.accepted_at IS NULL AND t.status<>'DISSOLVED'
  ),'[]'::jsonb)
 );
END
$context$;
