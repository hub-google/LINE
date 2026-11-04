
-- Workforce leave ledger: pinned policy version, pending holds, and anniversary windows.
CREATE OR REPLACE FUNCTION wm_private.leave_balance_core(p_tenant uuid,p_member uuid,p_on date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE p record;v_hired date;v_start date;v_until date;v_year int;
 v_from timestamptz;v_to timestamptz;v_grant numeric;v_used numeric;v_pending numeric;
 v_result jsonb:='[]'::jsonb;
BEGIN
 SELECT hired_on INTO v_hired FROM public.wm_members WHERE tenant_id=p_tenant AND id=p_member;
 FOR p IN
  SELECT DISTINCT ON(leave_kind) * FROM public.wm_leave_policies
  WHERE tenant_id=p_tenant AND effective_from<=p_on
  ORDER BY leave_kind,effective_from DESC
 LOOP
  IF NOT p.is_active THEN CONTINUE;END IF;
  IF p.yearly_basis='anniversary' AND v_hired IS NOT NULL THEN
    v_start:=(v_hired+make_interval(years:=greatest(0,extract(year FROM age(p_on,v_hired))::int)))::date;
    IF v_start>p_on THEN v_start:=(v_start-interval '1 year')::date;END IF;
  ELSE v_start:=make_date(extract(year FROM p_on)::int,1,1);END IF;
  v_until:=(v_start+interval '1 year')::date;
  v_year:=extract(year FROM v_start)::int;
  v_from:=v_start::timestamp AT TIME ZONE 'Asia/Taipei';
  v_to:=v_until::timestamp AT TIME ZONE 'Asia/Taipei';
  SELECT coalesce(sum(hours),0) INTO v_grant
   FROM public.wm_leave_entitlements WHERE tenant_id=p_tenant AND member_id=p_member
    AND year=v_year AND leave_kind=p.leave_kind;
  SELECT
   coalesce(sum(extract(epoch FROM least(r.ends_at,v_to)-greatest(r.starts_at,v_from))/3600)
     FILTER(WHERE r.status='approved'),0),
   coalesce(sum(extract(epoch FROM least(r.ends_at,v_to)-greatest(r.starts_at,v_from))/3600)
     FILTER(WHERE r.status='pending'),0)
   INTO v_used,v_pending
   FROM public.wm_requests r
   WHERE r.tenant_id=p_tenant AND r.member_id=p_member AND r.kind='leave'
     AND r.leave_kind=p.leave_kind AND r.status IN('approved','pending')
     AND r.starts_at<v_to AND r.ends_at>v_from;
  v_result:=v_result||jsonb_build_array(jsonb_build_object(
   'policy_id',p.id,'kind',p.leave_kind,'label',p.label,'year',v_year,
   'starts_on',v_start,'ends_before',v_until,'yearly_basis',p.yearly_basis,
   'approved_hours',v_used,'pending_hours',v_pending,
   'granted_hours',v_grant,'carryover_hours',p.carryover_hours,
   'remaining_hours',greatest(0,v_grant+p.carryover_hours-v_used-v_pending),
   'balance_required',p.balance_required,'approval_levels',p.approval_levels,
   'requires_document',p.requires_document));
 END LOOP;
 RETURN v_result;
END $fn$;
REVOKE ALL ON FUNCTION wm_private.leave_balance_core(uuid,uuid,date) FROM public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.wm_leave_balances(p_tenant uuid,p_member uuid,p_on date DEFAULT CURRENT_DATE)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF auth.uid() IS NULL OR NOT wm_private.member_visible(p_tenant,p_member) THEN
  RAISE EXCEPTION '沒有查看這位員工假期額度的權限' USING errcode='42501';END IF;
 RETURN wm_private.leave_balance_core(p_tenant,p_member,p_on);
END $fn$;
REVOKE ALL ON FUNCTION public.wm_leave_balances(uuid,uuid,date) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.wm_leave_balances(uuid,uuid,date) TO authenticated;
CREATE OR REPLACE FUNCTION wm_private.leave_request_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE p public.wm_leave_policies%rowtype;v_date date;v_limit date;
 v_balance jsonb;v_remaining numeric;v_needed numeric;v_until timestamptz;
BEGIN
 IF new.kind<>'leave' THEN RETURN new;END IF;
 v_date:=(new.starts_at AT TIME ZONE 'Asia/Taipei')::date;
 SELECT * INTO p FROM public.wm_leave_policies
 WHERE tenant_id=new.tenant_id AND leave_kind=new.leave_kind AND effective_from<=v_date
 ORDER BY effective_from DESC LIMIT 1;
 IF NOT FOUND THEN RETURN new;END IF; -- Preserve existing arrangements pending configuration.
 IF NOT p.is_active THEN RAISE EXCEPTION '這個假別目前已停用';END IF;
 PERFORM 1 FROM public.wm_members WHERE id=new.member_id AND tenant_id=new.tenant_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.wm_requests r WHERE r.tenant_id=new.tenant_id
   AND r.member_id=new.member_id AND r.kind='leave' AND r.status IN('pending','approved')
   AND tstzrange(r.starts_at,r.ends_at,'[)')&&tstzrange(new.starts_at,new.ends_at,'[)'))
 THEN RAISE EXCEPTION '該時段已有待審或核准的請假，請避免重複申請';END IF;
 IF p.balance_required THEN
  WHILE (v_date::timestamp AT TIME ZONE 'Asia/Taipei')<new.ends_at LOOP
    v_balance:=wm_private.leave_balance_core(new.tenant_id,new.member_id,v_date);
    SELECT (v->>'remaining_hours')::numeric,
      (v->>'ends_before')::date INTO v_remaining,v_limit
      FROM jsonb_array_elements(v_balance) v WHERE v->>'kind'=new.leave_kind;
    IF v_limit IS NULL THEN RAISE EXCEPTION '沒有可用的假別額度';END IF;
    v_until:=v_limit::timestamp AT TIME ZONE 'Asia/Taipei';
    v_needed:=extract(epoch FROM least(v_until,new.ends_at) -
      greatest(v_date::timestamp AT TIME ZONE 'Asia/Taipei',new.starts_at))/3600;
    IF coalesce(v_remaining,0)+0.0001<v_needed THEN
      RAISE EXCEPTION '剩餘假期時數不足（已包含待審占用），請重新填寫';END IF;
    v_date:=v_limit;
  END LOOP;
 END IF;
 RETURN new;
END $fn$;
DROP TRIGGER IF EXISTS wm_leave_request_guard ON public.wm_requests;
CREATE TRIGGER wm_leave_request_guard BEFORE INSERT ON public.wm_requests
 FOR EACH ROW EXECUTE FUNCTION wm_private.leave_request_guard();
NOTIFY pgrst,'reload schema';
