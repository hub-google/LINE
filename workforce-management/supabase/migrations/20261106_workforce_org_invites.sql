
-- Tenant-scoped invitations: tokens are single use, hashed at rest and email bound.
CREATE TABLE IF NOT EXISTS public.wm_org_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.wm_tenants(id) ON DELETE CASCADE,
  member_id uuid NOT NULL,
  normalized_email text NOT NULL,
  token_sha256 text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT (now()+interval '7 days'),
  accepted_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wm_org_invite_member_fk FOREIGN KEY(tenant_id,member_id)
    REFERENCES public.wm_members(tenant_id,id) ON DELETE CASCADE,
  CONSTRAINT wm_org_invite_email_valid CHECK (normalized_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);
CREATE INDEX IF NOT EXISTS wm_org_invites_lookup ON public.wm_org_invites(tenant_id,member_id) WHERE accepted_at IS NULL;
ALTER TABLE public.wm_org_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wm_org_invites FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS public.wm_org_role_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.wm_tenants(id) ON DELETE CASCADE,
 member_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 action text NOT NULL,
 old_values jsonb,
 new_values jsonb,
 recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wm_org_role_audit_idx ON public.wm_org_role_audit(tenant_id,recorded_at DESC);
ALTER TABLE public.wm_org_role_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wm_org_role_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.wm_org_role_audit TO authenticated;
CREATE POLICY wm_org_audit_admin_read ON public.wm_org_role_audit
 FOR SELECT TO authenticated
 USING (COALESCE(wm_private.my_role(tenant_id) IN ('owner','hr'),false));

CREATE OR REPLACE FUNCTION public.wm_org_set_member(
 p_member uuid,p_role text,p_reports_to uuid,p_job_title text,p_department uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE oldm public.wm_members%rowtype; a_role text; newm public.wm_members%rowtype;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION '請先登入'; END IF;
 SELECT * INTO oldm FROM public.wm_members WHERE id=p_member FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '員工不存在'; END IF;
 a_role:=wm_private.my_role(oldm.tenant_id);
 IF a_role NOT IN ('owner','hr') THEN RAISE EXCEPTION '只有企業管理者可設定組織層級'; END IF;
 IF p_role NOT IN ('owner','hr','manager','employee') THEN RAISE EXCEPTION '角色不正確'; END IF;
 IF oldm.role='owner' OR p_role='owner' THEN
   RAISE EXCEPTION '企業擁有者權限不可透過一般組織編輯修改';
 END IF;
 IF a_role='hr' AND (oldm.role='hr' OR p_role='hr') THEN
   RAISE EXCEPTION '僅企業擁有者可編輯人資角色';
 END IF;
 IF p_department IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.wm_departments d WHERE d.id=p_department AND d.tenant_id=oldm.tenant_id)
 THEN RAISE EXCEPTION '部門不屬於目前企業'; END IF;
 UPDATE public.wm_members
  SET role=p_role,reports_to=p_reports_to,
  job_title=left(trim(coalesce(p_job_title,'')),80),department_id=p_department
  WHERE id=p_member RETURNING * INTO newm;
 INSERT INTO public.wm_org_role_audit(tenant_id,member_id,actor_id,action,old_values,new_values)
 VALUES(oldm.tenant_id,p_member,auth.uid(),'org_update',
    jsonb_build_object('role',oldm.role,'reports_to',oldm.reports_to,'job_title',oldm.job_title,'department_id',oldm.department_id),
    jsonb_build_object('role',newm.role,'reports_to',newm.reports_to,'job_title',newm.job_title,'department_id',newm.department_id));
 RETURN jsonb_build_object('ok',true,'member_id',newm.id);
END $$;
REVOKE ALL ON FUNCTION public.wm_org_set_member(uuid,text,uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wm_org_set_member(uuid,text,uuid,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.wm_org_invite(
 p_tenant uuid,p_email text,p_name text,p_role text,
 p_reports_to uuid,p_job_title text,p_branch uuid,p_department uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a_role text;member public.wm_members%rowtype; inv public.wm_org_invites%rowtype;
 v_token text; v_email text:=lower(trim(coalesce(p_email,''))); v_code text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION '請先登入'; END IF;
 a_role:=wm_private.my_role(p_tenant);
 IF a_role NOT IN ('owner','hr') THEN RAISE EXCEPTION '只有企業管理者可以發送邀請';END IF;
 IF p_role NOT IN ('hr','manager','employee') OR (p_role='hr' AND a_role<>'owner')
 THEN RAISE EXCEPTION '沒有權限指派此角色';END IF;
 IF v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 THEN RAISE EXCEPTION '請輸入有效的員工 Email'; END IF;
 IF length(trim(coalesce(p_name,'')))<1 OR length(trim(p_name))>100 THEN RAISE EXCEPTION '員工姓名不正確'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.wm_branches WHERE id=p_branch AND tenant_id=p_tenant)
 THEN RAISE EXCEPTION '分店不存在'; END IF;
 IF p_department IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.wm_departments WHERE id=p_department AND tenant_id=p_tenant)
 THEN RAISE EXCEPTION '部門不屬於本企業'; END IF;
 IF EXISTS(
  SELECT 1 FROM public.wm_org_invites i WHERE i.tenant_id=p_tenant
   AND i.normalized_email=v_email AND i.accepted_at IS NULL AND i.expires_at>now()
 ) THEN RAISE EXCEPTION '此 Email 已有未到期邀請';END IF;
 v_code:='INV-'||upper(substr(gen_random_uuid()::text,1,8));
 INSERT INTO public.wm_members(tenant_id,branch_id,department_id,display_name,employee_code,role,
  reports_to,job_title,status)
 VALUES(p_tenant,p_branch,p_department,trim(p_name),v_code,p_role,
  p_reports_to,left(trim(coalesce(p_job_title,'')),80),'active')
 RETURNING * INTO member;
 v_token:=encode(gen_random_bytes(24),'hex');
 INSERT INTO public.wm_org_invites(tenant_id,member_id,normalized_email,token_sha256,created_by)
 VALUES(p_tenant,member.id,v_email,encode(sha256(convert_to(v_token,'UTF8')),'hex'),auth.uid())
 RETURNING * INTO inv;
 INSERT INTO public.wm_org_role_audit(tenant_id,member_id,actor_id,action,new_values)
 VALUES(p_tenant,member.id,auth.uid(),'invited',
  jsonb_build_object('role',p_role,'reports_to',p_reports_to,'department_id',p_department));
 RETURN jsonb_build_object('token',v_token,'email',v_email,'expires_at',inv.expires_at,'member_id',member.id);
END $$;
REVOKE ALL ON FUNCTION public.wm_org_invite(uuid,text,text,text,uuid,text,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wm_org_invite(uuid,text,text,text,uuid,text,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.wm_org_accept_invite(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE inv public.wm_org_invites%rowtype; v_email text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION '請先登入'; END IF;
 IF p_token IS NULL OR p_token !~ '^[0-9a-f]{48}$' THEN RAISE EXCEPTION '邀請連結不正確'; END IF;
 SELECT lower(email) INTO v_email FROM auth.users
 WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL;
 IF v_email IS NULL THEN RAISE EXCEPTION '請先完成 Email 驗證'; END IF;
 SELECT * INTO inv FROM public.wm_org_invites
 WHERE token_sha256=encode(sha256(convert_to(p_token,'UTF8')),'hex')
   AND accepted_at IS NULL AND expires_at>now()
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '邀請不存在、已使用或已到期';END IF;
 IF inv.normalized_email<>v_email THEN RAISE EXCEPTION '此邀請只限指定 Email 使用'; END IF;
 IF EXISTS(SELECT 1 FROM public.wm_members WHERE tenant_id=inv.tenant_id AND user_id=auth.uid() AND status='active')
 THEN RAISE EXCEPTION '此帳號已加入該企業';END IF;
 UPDATE public.wm_members SET user_id=auth.uid()
 WHERE id=inv.member_id AND tenant_id=inv.tenant_id AND user_id IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION '邀請的員工帳號已被綁定'; END IF;
 UPDATE public.wm_org_invites SET accepted_at=clock_timestamp() WHERE id=inv.id;
 INSERT INTO public.wm_org_role_audit(tenant_id,member_id,actor_id,action,new_values)
 VALUES(inv.tenant_id,inv.member_id,auth.uid(),'invite_accepted',jsonb_build_object('user_id',auth.uid()));
 RETURN jsonb_build_object('ok',true,'tenant_id',inv.tenant_id);
END $$;
REVOKE ALL ON FUNCTION public.wm_org_accept_invite(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wm_org_accept_invite(text) TO authenticated;
