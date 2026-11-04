
-- PRD HR-LVE: versioned company leave configuration without inventing statutory balances.
CREATE TABLE IF NOT EXISTS public.wm_leave_policies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.wm_tenants(id) ON DELETE CASCADE,
 leave_kind text NOT NULL CHECK(leave_kind~'^[a-z_]{2,40}$'),
 label text NOT NULL CHECK(char_length(trim(label)) BETWEEN 1 AND 80),
 effective_from date NOT NULL,
 yearly_basis text NOT NULL DEFAULT 'calendar' CHECK(yearly_basis IN('calendar','anniversary')),
 balance_required boolean NOT NULL DEFAULT false,
 carryover_hours numeric(10,2) NOT NULL DEFAULT 0 CHECK(carryover_hours BETWEEN 0 AND 4000),
 approval_levels int NOT NULL DEFAULT 1 CHECK(approval_levels BETWEEN 1 AND 3),
 requires_document boolean NOT NULL DEFAULT false,
 is_active boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,leave_kind,effective_from)
);
CREATE INDEX IF NOT EXISTS wm_leave_policy_lookup ON public.wm_leave_policies(tenant_id,leave_kind,effective_from DESC);
ALTER TABLE public.wm_leave_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wm_leave_policies FROM anon,authenticated;
GRANT SELECT ON public.wm_leave_policies TO authenticated;
CREATE POLICY wm_leave_policy_read ON public.wm_leave_policies FOR SELECT TO authenticated
 USING(wm_private.my_role(tenant_id) IS NOT NULL);
CREATE OR REPLACE FUNCTION public.wm_save_leave_policy(
 p_tenant uuid,p_kind text,p_label text,p_effective date,p_basis text,
 p_needs_balance boolean,p_carryover numeric,p_levels int,p_document boolean,p_active boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_id uuid;
BEGIN
 IF auth.uid() IS NULL OR wm_private.my_role(p_tenant) NOT IN('owner','hr') THEN
  RAISE EXCEPTION '只有企業擁有者或人資可以設定假勤規則' USING errcode='42501';END IF;
 IF p_kind IS NULL OR p_kind !~ '^[a-z_]{2,40}$'
 OR char_length(trim(coalesce(p_label,''))) NOT BETWEEN 1 AND 80 OR p_effective IS NULL
 OR p_basis NOT IN('calendar','anniversary') OR p_carryover NOT BETWEEN 0 AND 4000
 OR p_levels NOT BETWEEN 1 AND 3 OR p_needs_balance IS NULL OR p_document IS NULL
 OR p_active IS NULL THEN RAISE EXCEPTION '假別設定格式不正確';END IF;
 INSERT INTO public.wm_leave_policies(tenant_id,leave_kind,label,effective_from,yearly_basis,
 balance_required,carryover_hours,approval_levels,requires_document,is_active)
 VALUES(p_tenant,p_kind,trim(p_label),p_effective,p_basis,p_needs_balance,p_carryover,p_levels,p_document,p_active)
 ON CONFLICT(tenant_id,leave_kind,effective_from) DO UPDATE
 SET label=excluded.label,yearly_basis=excluded.yearly_basis,balance_required=excluded.balance_required,
 carryover_hours=excluded.carryover_hours,approval_levels=excluded.approval_levels,
 requires_document=excluded.requires_document,is_active=excluded.is_active,updated_at=clock_timestamp()
 RETURNING id INTO v_id;
 INSERT INTO public.wm_audit(tenant_id,actor_id,action,target_type,target_id,details)
 VALUES(p_tenant,auth.uid(),'leave_policy_saved','leave_policy',v_id,
 jsonb_build_object('kind',p_kind,'effective_from',p_effective));
 RETURN jsonb_build_object('id',v_id);
END $fn$;
CREATE OR REPLACE FUNCTION public.wm_grant_leave_hours(p_tenant uuid,p_member uuid,p_year int,p_kind text,p_hours numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_id uuid;
BEGIN
 IF auth.uid() IS NULL OR wm_private.my_role(p_tenant) NOT IN('owner','hr') THEN
  RAISE EXCEPTION '沒有核定假勤額度權限' USING errcode='42501';END IF;
 IF p_year NOT BETWEEN 2000 AND 2150 OR p_hours NOT BETWEEN 0 AND 4000 OR p_kind IS NULL
 OR NOT EXISTS(SELECT 1 FROM public.wm_members WHERE id=p_member AND tenant_id=p_tenant)
 THEN RAISE EXCEPTION '員工、年度或核定時數不正確';END IF;
 INSERT INTO public.wm_leave_entitlements(tenant_id,member_id,year,leave_kind,hours)
 VALUES(p_tenant,p_member,p_year,p_kind,p_hours)
 ON CONFLICT(tenant_id,member_id,year,leave_kind) DO UPDATE SET hours=excluded.hours
 RETURNING id INTO v_id;
 INSERT INTO public.wm_audit(tenant_id,actor_id,action,target_type,target_id,details)
 VALUES(p_tenant,auth.uid(),'leave_entitlement_granted','leave_entitlement',v_id,
 jsonb_build_object('member',p_member,'year',p_year,'kind',p_kind,'hours',p_hours));
 RETURN jsonb_build_object('id',v_id,'hours',p_hours);
END $fn$;
REVOKE ALL ON FUNCTION public.wm_save_leave_policy(uuid,text,text,date,text,boolean,numeric,int,boolean,boolean) FROM public,anon;
REVOKE ALL ON FUNCTION public.wm_grant_leave_hours(uuid,uuid,int,text,numeric) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.wm_save_leave_policy(uuid,text,text,date,text,boolean,numeric,int,boolean,boolean),
public.wm_grant_leave_hours(uuid,uuid,int,text,numeric) TO authenticated;
NOTIFY pgrst,'reload schema';
