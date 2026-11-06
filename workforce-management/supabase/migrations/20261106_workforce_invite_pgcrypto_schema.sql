-- SECURITY DEFINER function uses search_path='', so pgcrypto requires schema qualification.
CREATE OR REPLACE FUNCTION public.wm_org_invite(p_tenant uuid, p_email text, p_name text, p_role text, p_reports_to uuid, p_job_title text, p_branch uuid, p_department uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 v_token:=encode(extensions.gen_random_bytes(24),'hex');
 INSERT INTO public.wm_org_invites(tenant_id,member_id,normalized_email,token_sha256,created_by)
 VALUES(p_tenant,member.id,v_email,encode(sha256(convert_to(v_token,'UTF8')),'hex'),auth.uid())
 RETURNING * INTO inv;
 INSERT INTO public.wm_org_role_audit(tenant_id,member_id,actor_id,action,new_values)
 VALUES(p_tenant,member.id,auth.uid(),'invited',
  jsonb_build_object('role',p_role,'reports_to',p_reports_to,'department_id',p_department));
 RETURN jsonb_build_object('token',v_token,'email',v_email,'expires_at',inv.expires_at,'member_id',member.id);
END $function$
;
