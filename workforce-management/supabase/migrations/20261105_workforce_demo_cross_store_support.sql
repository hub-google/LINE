
-- Demo-only branch support assignment for fictitious employees.
CREATE OR REPLACE FUNCTION public.wm_demo_branch_support(p_action text DEFAULT 'snapshot',p_data jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE t constant uuid:='98d3505c-cbe6-46ed-a95a-13672e6d98f4';
v_id uuid;v_member uuid;v_branch uuid;v_from date;v_until date;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.wm_tenants WHERE id=t AND is_demo) THEN
  RAISE EXCEPTION 'Demo 未啟用';END IF;
 IF p_action='snapshot' THEN
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.active_from DESC)
   FROM public.wm_member_branches b WHERE b.tenant_id=t),'[]'::jsonb);
 ELSIF p_action='assign' THEN
  v_member:=(p_data->>'member_id')::uuid;v_branch:=(p_data->>'branch_id')::uuid;
  v_from:=(p_data->>'active_from')::date;
  v_until:=NULLIF(p_data->>'active_until','')::date;
  IF v_from IS NULL OR (v_until IS NOT NULL AND v_until<v_from) OR
   NOT EXISTS(SELECT 1 FROM public.wm_members WHERE tenant_id=t AND id=v_member AND status='active') OR
   NOT EXISTS(SELECT 1 FROM public.wm_branches WHERE tenant_id=t AND id=v_branch)
   THEN RAISE EXCEPTION '跨店支援資料不正確';END IF;
  IF (SELECT count(*) FROM public.wm_member_branches WHERE tenant_id=t)>=100
    AND NOT EXISTS(SELECT 1 FROM public.wm_member_branches
     WHERE tenant_id=t AND member_id=v_member AND branch_id=v_branch AND active_from=v_from)
  THEN RAISE EXCEPTION 'Demo 跨店紀錄已達上限';END IF;
  INSERT INTO public.wm_member_branches(tenant_id,member_id,branch_id,active_from,active_until)
  VALUES(t,v_member,v_branch,v_from,v_until)
  ON CONFLICT(tenant_id,member_id,branch_id,active_from) DO UPDATE SET active_until=excluded.active_until
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id',v_id);
 END IF;
 RAISE EXCEPTION '不支援此操作';
END $fn$;
REVOKE ALL ON FUNCTION public.wm_demo_branch_support(text,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.wm_demo_branch_support(text,jsonb) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
