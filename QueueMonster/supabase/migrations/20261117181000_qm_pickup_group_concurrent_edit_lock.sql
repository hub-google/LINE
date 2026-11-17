-- Serialize collaborative edits with group submission to prevent stale writes.
CREATE OR REPLACE FUNCTION public.so_pickup_group_save(p_slug text, p_group uuid, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE g public.qm_pickup_groups;e jsonb;
BEGIN
 g:=private.qm_pickup_group_authorize(p_slug,p_group);
 SELECT * INTO g FROM public.qm_pickup_groups WHERE id=g.id FOR UPDATE;
 IF g.submitted_order_id IS NOT NULL THEN RAISE EXCEPTION '團購已結單'; END IF;
 IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)>20
 OR pg_column_size(p_items)>15000 THEN RAISE EXCEPTION '團購餐點數量或格式無效'; END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  IF coalesce(e->>'id','') !~ '^[0-9a-fA-F-]{36}$'
  OR coalesce(e->>'qty','') !~ '^([1-9]|1[0-9]|20)$'
  OR jsonb_typeof(coalesce(e->'options','[]'::jsonb))<>'array'
  THEN RAISE EXCEPTION '團購餐點內容不正確'; END IF;
 END LOOP;
 INSERT INTO public.qm_pickup_group_lines(group_id,user_id,items)
 VALUES(g.id,auth.uid(),p_items)
 ON CONFLICT(group_id,user_id) DO UPDATE SET items=excluded.items,updated_at=now();
 RETURN jsonb_build_object('saved',true);
END $function$
;
