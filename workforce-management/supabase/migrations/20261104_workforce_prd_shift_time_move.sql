
-- HR-SCH-02: safe move by drag/drop or date edit, preserving shift duration.
CREATE OR REPLACE FUNCTION public.wm_move_shift(p_tenant uuid,p_shift uuid,p_start timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE s public.wm_shifts%rowtype;v_new_end timestamptz;
BEGIN
 IF auth.uid() IS NULL OR NOT wm_private.can_manage(p_tenant) THEN
  RAISE EXCEPTION '沒有調整排班權限' USING errcode='42501';END IF;
 SELECT * INTO s FROM public.wm_shifts
  WHERE id=p_shift AND tenant_id=p_tenant FOR UPDATE;
 IF NOT FOUND OR s.status='cancelled' THEN RAISE EXCEPTION '班次不存在或已取消';END IF;
 IF p_start IS NULL OR p_start<now()-interval '90 days' OR p_start>now()+interval '365 days'
 THEN RAISE EXCEPTION '排班日期超出可編輯範圍';END IF;
 v_new_end:=p_start+(s.ends_at-s.starts_at);
 UPDATE public.wm_shifts SET starts_at=p_start,ends_at=v_new_end,updated_at=clock_timestamp()
 WHERE tenant_id=p_tenant AND id=p_shift;
 INSERT INTO public.wm_audit(tenant_id,actor_id,action,target_type,target_id,details)
 VALUES(p_tenant,auth.uid(),'shift_time_moved','shift',p_shift,
 jsonb_build_object('old_start',s.starts_at,'new_start',p_start,'old_end',s.ends_at,'new_end',v_new_end));
 RETURN jsonb_build_object('id',p_shift,'starts_at',p_start,'ends_at',v_new_end);
END $fn$;
REVOKE ALL ON FUNCTION public.wm_move_shift(uuid,uuid,timestamptz) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.wm_move_shift(uuid,uuid,timestamptz) TO authenticated;
NOTIFY pgrst,'reload schema';
