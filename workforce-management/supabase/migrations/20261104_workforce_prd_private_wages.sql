-- Harden sensitive workforce columns: employees cannot query hourly wages through Data API.
REVOKE SELECT ON TABLE public.wm_members FROM authenticated;
GRANT SELECT (id,tenant_id,branch_id,user_id,display_name,employee_code,role,employment_type,status,created_at,department_id,hired_on,left_on,skills) ON public.wm_members TO authenticated;
-- Owner/HR-only wage retrieval is a separate audited, tenant-scoped RPC.
CREATE OR REPLACE FUNCTION public.wm_staff_wages(p_tenant uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_role text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION '請先登入' USING errcode='28000'; END IF;
 v_role:=wm_private.my_role(p_tenant);
 IF v_role NOT IN ('owner','hr') THEN RAISE EXCEPTION '只有企業負責人或人資可以讀取薪資資料' USING errcode='42501';END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('member_id',m.id,'hourly_rate',m.hourly_rate))
 FROM public.wm_members m WHERE m.tenant_id=p_tenant),'[]'::jsonb);
END $fn$;
REVOKE ALL ON FUNCTION public.wm_staff_wages(uuid) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.wm_staff_wages(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';