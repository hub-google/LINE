
-- HR-ORG-03, HR-SCH-04: explicit cross-branch assignment, with employment windows.
CREATE TABLE IF NOT EXISTS public.wm_member_branches(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.wm_tenants(id) ON DELETE CASCADE,
 member_id uuid NOT NULL,
 branch_id uuid NOT NULL,
 active_from date NOT NULL,
 active_until date,
 created_by uuid REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(active_until IS NULL OR active_until>=active_from),
 UNIQUE(tenant_id,member_id,branch_id,active_from),
 FOREIGN KEY(tenant_id,member_id) REFERENCES public.wm_members(tenant_id,id),
 FOREIGN KEY(tenant_id,branch_id) REFERENCES public.wm_branches(tenant_id,id)
);
ALTER TABLE public.wm_member_branches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wm_member_branches FROM anon,authenticated;
GRANT SELECT ON public.wm_member_branches TO authenticated;
CREATE POLICY wm_member_branches_read ON public.wm_member_branches FOR SELECT TO authenticated
 USING(wm_private.member_visible(tenant_id,member_id));

CREATE OR REPLACE FUNCTION public.wm_assign_branch(p_tenant uuid,p_member uuid,p_branch uuid,
 p_from date,p_until date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT wm_private.can_manage(p_tenant) THEN
  RAISE EXCEPTION '沒有跨店支援指派權限' USING errcode='42501';END IF;
 IF p_from IS NULL OR (p_until IS NOT NULL AND p_until<p_from)
 OR NOT EXISTS(SELECT 1 FROM public.wm_members WHERE tenant_id=p_tenant AND id=p_member AND status='active')
 OR NOT EXISTS(SELECT 1 FROM public.wm_branches WHERE tenant_id=p_tenant AND id=p_branch)
 THEN RAISE EXCEPTION '員工、分店或派駐期間格式錯誤';END IF;
 INSERT INTO public.wm_member_branches(tenant_id,member_id,branch_id,active_from,active_until,created_by)
 VALUES(p_tenant,p_member,p_branch,p_from,p_until,auth.uid())
 ON CONFLICT(tenant_id,member_id,branch_id,active_from) DO UPDATE SET active_until=excluded.active_until
 RETURNING id INTO v_id;
 INSERT INTO public.wm_audit(tenant_id,actor_id,action,target_type,target_id,details)
 VALUES(p_tenant,auth.uid(),'cross_branch_assigned','member',p_member,
 jsonb_build_object('branch_id',p_branch,'from',p_from,'until',p_until));
 RETURN jsonb_build_object('id',v_id);
END $fn$;

CREATE OR REPLACE FUNCTION wm_private.guard_shift_overlap()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_source text:=current_setting('wm.swap_source',true);
v_target text:=current_setting('wm.swap_target',true);
v_policy public.wm_schedule_rules%rowtype;v_member public.wm_members%rowtype;
v_week_start timestamptz;v_week_end timestamptz;v_week_total numeric;
BEGIN
 IF new.status='cancelled' THEN RETURN new;END IF;
 IF new.starts_at IS NULL OR new.ends_at IS NULL OR new.ends_at<=new.starts_at
 OR new.ends_at>new.starts_at+interval '24 hours' THEN
  RAISE EXCEPTION '班次日期或時間不合法';END IF;
 SELECT * INTO v_member FROM public.wm_members
 WHERE tenant_id=new.tenant_id AND id=new.member_id;
 IF NOT FOUND OR v_member.status<>'active' THEN
  RAISE EXCEPTION '員工不存在或已停用，無法排班';END IF;
 IF (v_member.hired_on IS NOT NULL AND (new.starts_at AT TIME ZONE 'Asia/Taipei')::date<v_member.hired_on)
    OR (v_member.left_on IS NOT NULL AND (new.starts_at AT TIME ZONE 'Asia/Taipei')::date>v_member.left_on)
 THEN RAISE EXCEPTION '班次超出員工在職起迄期間';END IF;
 IF v_member.branch_id IS DISTINCT FROM new.branch_id
  AND NOT EXISTS(SELECT 1 FROM public.wm_member_branches b WHERE b.tenant_id=new.tenant_id
   AND b.member_id=new.member_id AND b.branch_id=new.branch_id
   AND b.active_from<=(new.starts_at AT TIME ZONE 'Asia/Taipei')::date
   AND (b.active_until IS NULL OR b.active_until>=(new.starts_at AT TIME ZONE 'Asia/Taipei')::date))
 THEN RAISE EXCEPTION '員工未獲授權跨店支援這個門市';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(new.member_id::text,815));
 IF EXISTS(SELECT 1 FROM public.wm_shifts s
  WHERE s.tenant_id=new.tenant_id AND s.member_id=new.member_id
  AND s.status<>'cancelled' AND s.id IS DISTINCT FROM new.id
  AND tstzrange(s.starts_at,s.ends_at,'[)')&&tstzrange(new.starts_at,new.ends_at,'[)')
  AND NOT (v_source IS NOT NULL AND v_target IS NOT NULL
   AND new.id::text IN(v_source,v_target) AND s.id::text IN(v_source,v_target)))
 THEN RAISE EXCEPTION '員工已有重疊班別，不可重複排班';END IF;
 SELECT * INTO v_policy FROM public.wm_schedule_rules r WHERE r.tenant_id=new.tenant_id
  AND r.effective_from<=(new.starts_at AT TIME ZONE 'Asia/Taipei')::date
  ORDER BY r.effective_from DESC LIMIT 1;
 IF NOT FOUND THEN RETURN new;END IF;
 IF v_policy.max_shift_minutes>0 AND
   extract(epoch FROM new.ends_at-new.starts_at)/60>v_policy.max_shift_minutes
 THEN RAISE EXCEPTION '單一班次超過企業設定的工時上限';END IF;
 IF v_policy.min_rest_minutes>0 AND EXISTS(
  SELECT 1 FROM public.wm_shifts s
  WHERE s.tenant_id=new.tenant_id AND s.member_id=new.member_id
   AND s.id IS DISTINCT FROM new.id AND s.status<>'cancelled'
   AND NOT (v_source IS NOT NULL AND v_target IS NOT NULL
     AND new.id::text IN(v_source,v_target) AND s.id::text IN(v_source,v_target))
   AND ((s.ends_at<=new.starts_at AND
     s.ends_at>new.starts_at-make_interval(mins:=v_policy.min_rest_minutes))
     OR (s.starts_at>=new.ends_at AND
     s.starts_at<new.ends_at+make_interval(mins:=v_policy.min_rest_minutes)))
 ) THEN RAISE EXCEPTION '此員工前後班的休息間隔不足企業規定';END IF;
 IF v_policy.max_week_minutes>0 THEN
  v_week_start:=date_trunc('week',new.starts_at AT TIME ZONE 'Asia/Taipei') AT TIME ZONE 'Asia/Taipei';
  v_week_end:=v_week_start+interval '7 days';
  SELECT coalesce(sum(extract(epoch FROM least(s.ends_at,v_week_end)-greatest(s.starts_at,v_week_start))/60),0)
   INTO v_week_total FROM public.wm_shifts s
   WHERE s.tenant_id=new.tenant_id AND s.member_id=new.member_id
    AND s.id IS DISTINCT FROM new.id AND s.status<>'cancelled'
    AND s.starts_at<v_week_end AND s.ends_at>v_week_start
    AND NOT (v_source IS NOT NULL AND v_target IS NOT NULL
     AND new.id::text IN(v_source,v_target) AND s.id::text IN(v_source,v_target));
  v_week_total:=v_week_total+extract(epoch FROM
   least(new.ends_at,v_week_end)-greatest(new.starts_at,v_week_start))/60;
  IF v_week_total>v_policy.max_week_minutes THEN
   RAISE EXCEPTION '此員工排定工時超過企業每週上限';END IF;
 END IF;
 RETURN new;
END $function$;

REVOKE ALL ON FUNCTION public.wm_assign_branch(uuid,uuid,uuid,date,date) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.wm_assign_branch(uuid,uuid,uuid,date,date) TO authenticated;
NOTIFY pgrst,'reload schema';
