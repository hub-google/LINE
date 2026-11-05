
-- HR-SCH-05: configurable, per-company scheduling constraints; no statutory default imposed on all businesses.
CREATE TABLE IF NOT EXISTS public.wm_schedule_rules (
 tenant_id uuid NOT NULL REFERENCES public.wm_tenants(id) ON DELETE CASCADE,
 effective_from date NOT NULL,
 min_rest_minutes integer NOT NULL DEFAULT 0 CHECK (min_rest_minutes BETWEEN 0 AND 1440),
 max_shift_minutes integer NOT NULL DEFAULT 0 CHECK (max_shift_minutes BETWEEN 0 AND 1440),
 max_week_minutes integer NOT NULL DEFAULT 0 CHECK (max_week_minutes BETWEEN 0 AND 10080),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,effective_from)
);
CREATE INDEX IF NOT EXISTS wm_schedule_rules_active_idx ON public.wm_schedule_rules(tenant_id,effective_from DESC);
ALTER TABLE public.wm_schedule_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wm_schedule_rules FROM anon,authenticated;
GRANT SELECT ON public.wm_schedule_rules TO authenticated;
CREATE POLICY wm_schedule_rules_read ON public.wm_schedule_rules FOR SELECT TO authenticated
 USING(wm_private.my_role(tenant_id) IS NOT NULL);

CREATE OR REPLACE FUNCTION public.wm_save_schedule_rules(p_tenant uuid,p_effective date,
 p_min_rest int,p_max_shift int,p_max_week int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF auth.uid() IS NULL OR wm_private.my_role(p_tenant) NOT IN('owner','hr') THEN
  RAISE EXCEPTION '僅企業負責人或人資可修改排班規則' USING errcode='42501';END IF;
 IF p_effective IS NULL OR p_min_rest NOT BETWEEN 0 AND 1440 OR
  p_max_shift NOT BETWEEN 0 AND 1440 OR p_max_week NOT BETWEEN 0 AND 10080
 THEN RAISE EXCEPTION '排班規則格式不正確';END IF;
 INSERT INTO public.wm_schedule_rules(tenant_id,effective_from,min_rest_minutes,max_shift_minutes,max_week_minutes)
 VALUES(p_tenant,p_effective,p_min_rest,p_max_shift,p_max_week)
 ON CONFLICT(tenant_id,effective_from) DO UPDATE
 SET min_rest_minutes=excluded.min_rest_minutes,
 max_shift_minutes=excluded.max_shift_minutes,max_week_minutes=excluded.max_week_minutes,
 updated_at=clock_timestamp();
 INSERT INTO public.wm_audit(tenant_id,actor_id,action,target_type,details)
 VALUES(p_tenant,auth.uid(),'schedule_rules_saved','tenant',
 jsonb_build_object('effective',p_effective,'rest_minutes',p_min_rest,
 'max_shift_minutes',p_max_shift,'max_week_minutes',p_max_week));
 RETURN jsonb_build_object('saved',true,'effective_from',p_effective);
END $fn$;
CREATE OR REPLACE FUNCTION wm_private.guard_shift_overlap()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_source text:=current_setting('wm.swap_source',true);
v_target text:=current_setting('wm.swap_target',true);
v_policy public.wm_schedule_rules%rowtype;
v_week_start timestamptz;v_week_end timestamptz;v_week_total numeric;
BEGIN
 IF new.status='cancelled' THEN RETURN new;END IF;
 IF new.starts_at IS NULL OR new.ends_at IS NULL OR new.ends_at<=new.starts_at
 OR new.ends_at>new.starts_at+interval '24 hours' THEN
  RAISE EXCEPTION '班次日期或時間不合法';END IF;
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
END $fn$;
REVOKE ALL ON FUNCTION public.wm_save_schedule_rules(uuid,date,int,int,int) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.wm_save_schedule_rules(uuid,date,int,int,int) TO authenticated;
NOTIFY pgrst,'reload schema';
