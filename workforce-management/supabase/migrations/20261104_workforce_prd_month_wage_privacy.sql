
-- Privacy regression: management of shifts does not imply access to employee pay.
CREATE OR REPLACE FUNCTION public.wm_month_report(p_tenant uuid,p_year int,p_month int)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_report jsonb;v_role text;
BEGIN
 v_role:=wm_private.my_role(p_tenant);
 IF auth.uid() IS NULL OR v_role NOT IN ('owner','hr','manager') THEN
  RAISE EXCEPTION '沒有查看企業工時彙整權限' USING errcode='42501';END IF;
 v_report:=wm_private.month_report_core(p_tenant,p_year,p_month);
 IF v_role='manager' THEN
   v_report:=jsonb_set(v_report,'{rows}',(
    SELECT coalesce(jsonb_agg(row_data - 'hourly_rate' - 'estimated_cost'),'[]'::jsonb)
    FROM jsonb_array_elements(v_report->'rows') row_data));
 END IF;
 RETURN v_report;
END $fn$;
CREATE OR REPLACE FUNCTION public.wm_close_month(p_tenant uuid,p_year int,p_month int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_first timestamptz;v_summary jsonb;v_id uuid;
BEGIN
 IF auth.uid() IS NULL OR wm_private.my_role(p_tenant) NOT IN ('owner','hr') THEN
  RAISE EXCEPTION '只有企業負責人或人資可鎖定月結' USING errcode='42501';END IF;
 IF p_year NOT BETWEEN 2000 AND 2150 OR p_month NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION '年月不正確';END IF;
 v_first:=make_timestamptz(p_year,p_month,1,0,0,0,'Asia/Taipei');
 IF v_first+interval '1 month'>now() THEN RAISE EXCEPTION '該月份尚未結束';END IF;
 v_summary:=wm_private.month_report_core(p_tenant,p_year,p_month);
 INSERT INTO public.wm_period_closures(tenant_id,year,month,snapshot,closed_by)
 VALUES(p_tenant,p_year,p_month,v_summary,auth.uid()) RETURNING id INTO v_id;
 INSERT INTO public.wm_audit(tenant_id,actor_id,action,target_type,target_id,details)
 VALUES(p_tenant,auth.uid(),'month_closed','period',v_id,
  jsonb_build_object('year',p_year,'month',p_month));
 RETURN jsonb_build_object('id',v_id,'snapshot',v_summary);
END $fn$;
CREATE OR REPLACE FUNCTION public.wm_adjust_closed_month(p_close_id uuid,p_member_id uuid,p_minutes int,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_close public.wm_period_closures%rowtype;v_id uuid;
BEGIN
 SELECT * INTO v_close FROM public.wm_period_closures WHERE id=p_close_id;
 IF NOT FOUND OR auth.uid() IS NULL OR wm_private.my_role(v_close.tenant_id) NOT IN ('owner','hr')
 THEN RAISE EXCEPTION '只有企業負責人或人資可調整月結' USING errcode='42501';END IF;
 IF p_minutes=0 OR abs(p_minutes)>43200 OR length(trim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 500
 THEN RAISE EXCEPTION '分鐘數或原因不正確';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.wm_members WHERE tenant_id=v_close.tenant_id AND id=p_member_id)
 THEN RAISE EXCEPTION '員工不存在';END IF;
 INSERT INTO public.wm_period_adjustments(tenant_id,closure_id,member_id,minutes_delta,reason,adjusted_by)
 VALUES(v_close.tenant_id,v_close.id,p_member_id,p_minutes,p_reason,auth.uid()) RETURNING id INTO v_id;
 INSERT INTO public.wm_audit(tenant_id,actor_id,action,target_type,target_id,details)
 VALUES(v_close.tenant_id,auth.uid(),'month_adjustment_added','period',v_close.id,
 jsonb_build_object('member_id',p_member_id,'minutes_delta',p_minutes,'reason',p_reason));
 RETURN jsonb_build_object('adjustment_id',v_id,'closure_id',v_close.id);
END $fn$;
DROP POLICY IF EXISTS wm_period_read ON public.wm_period_closures;
CREATE POLICY wm_period_read ON public.wm_period_closures FOR SELECT TO authenticated
 USING(wm_private.my_role(tenant_id) IN('owner','hr'));
DROP POLICY IF EXISTS wm_adjustments_read ON public.wm_period_adjustments;
CREATE POLICY wm_adjustments_read ON public.wm_period_adjustments FOR SELECT TO authenticated
 USING(wm_private.my_role(tenant_id) IN('owner','hr'));
NOTIFY pgrst,'reload schema';
