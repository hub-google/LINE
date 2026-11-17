
-- Queue Monster: pickup options, daily inventory, group orders and repeat customers.
-- Only qm_* objects; existing reservations and orders are preserved.
ALTER TABLE public.qm_menu_items
  ADD COLUMN IF NOT EXISTS pickup_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pickup_daily_limit integer;
ALTER TABLE public.qm_menu_items
  DROP CONSTRAINT IF EXISTS qm_menu_items_pickup_daily_limit_check;
ALTER TABLE public.qm_menu_items
  ADD CONSTRAINT qm_menu_items_pickup_daily_limit_check
  CHECK (pickup_daily_limit IS NULL OR pickup_daily_limit BETWEEN 0 AND 100000);

CREATE OR REPLACE FUNCTION public.so_pickup_save_extras(
 p_slug text,p_item_id uuid,p_options jsonb,p_daily_limit integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t uuid; g jsonb;c jsonb; v_name text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION '請先登入' USING ERRCODE='28000'; END IF;
 SELECT id INTO t FROM public.qm_tenants WHERE slug=p_slug AND status='ACTIVE';
 IF t IS NULL OR
 (coalesce(private.so_role(t),'') NOT IN ('OWNER','MANAGER') AND NOT coalesce(private.so_platform(),false))
 THEN RAISE EXCEPTION '只有店家管理者可修改商品規格與庫存' USING ERRCODE='42501'; END IF;
 IF p_daily_limit IS NOT NULL AND NOT p_daily_limit BETWEEN 0 AND 100000
 THEN RAISE EXCEPTION '每日限量應為 0～100000，留空表示不限量'; END IF;
 IF p_options IS NULL OR jsonb_typeof(p_options)<>'array'
    OR jsonb_array_length(p_options)>10 OR pg_column_size(p_options)>12000
 THEN RAISE EXCEPTION '規格格式錯誤，最多 10 組'; END IF;
 FOR g IN SELECT value FROM jsonb_array_elements(p_options) LOOP
   IF jsonb_typeof(g)<>'object' OR length(btrim(coalesce(g->>'name',''))) NOT BETWEEN 1 AND 40
      OR jsonb_typeof(g->'choices')<>'array'
      OR jsonb_array_length(g->'choices') NOT BETWEEN 1 AND 20
      OR (g ? 'multiple' AND jsonb_typeof(g->'multiple')<>'boolean')
      OR (g ? 'required' AND jsonb_typeof(g->'required')<>'boolean')
   THEN RAISE EXCEPTION '規格組名稱、必填設定或選項格式有誤'; END IF;
   FOR c IN SELECT value FROM jsonb_array_elements(g->'choices') LOOP
     IF jsonb_typeof(c)<>'object' OR length(btrim(coalesce(c->>'name',''))) NOT BETWEEN 1 AND 50
        OR coalesce(c->>'price','') !~ '^[0-9]+(\.[0-9]{1,2})?$'
        OR (c->>'price')::numeric>10000
     THEN RAISE EXCEPTION '規格選項名稱或加價金額無效'; END IF;
   END LOOP;
 END LOOP;
 UPDATE public.qm_menu_items SET pickup_options=p_options,pickup_daily_limit=p_daily_limit,updated_at=now()
 WHERE tenant_id=t AND id=p_item_id AND kind<>'SERVICE';
 IF NOT FOUND THEN RAISE EXCEPTION '找不到可訂餐商品'; END IF;
 INSERT INTO public.qm_audit(tenant_id,actor,action,info)
 VALUES(t,auth.uid(),'pickup_extras_saved',jsonb_build_object('item_id',p_item_id,'daily_limit',p_daily_limit));
 RETURN jsonb_build_object('saved',true);
END $$;
REVOKE ALL ON FUNCTION public.so_pickup_save_extras(text,uuid,jsonb,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.so_pickup_save_extras(text,uuid,jsonb,integer) TO authenticated;

-- Lock each item/day independently so concurrent orders cannot exceed a daily limit.
CREATE OR REPLACE FUNCTION private.qm_pickup_stock_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid;v_qty integer;v_limit integer;v_used integer;v_day date;
BEGIN
 IF new.status IN ('CANCELLED','REJECTED') THEN RETURN new; END IF;
 v_day:=(new.pickup_at AT TIME ZONE 'Asia/Taipei')::date;
 FOR v_id,v_qty IN
   SELECT (x.value->>'id')::uuid, sum((x.value->>'qty')::int)::integer
   FROM jsonb_array_elements(new.items) x
   GROUP BY 1 ORDER BY 1
 LOOP
   SELECT pickup_daily_limit INTO v_limit FROM public.qm_menu_items
    WHERE id=v_id AND tenant_id=new.tenant_id;
   IF v_limit IS NULL THEN CONTINUE; END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended(new.tenant_id::text||':'||v_id::text||':'||v_day::text,0));
   SELECT coalesce(sum((line.value->>'qty')::int),0) INTO v_used
   FROM public.qm_pickup_orders o
   CROSS JOIN LATERAL jsonb_array_elements(o.items) line
   WHERE o.tenant_id=new.tenant_id AND o.id IS DISTINCT FROM new.id
     AND o.status NOT IN ('CANCELLED','REJECTED')
     AND (o.pickup_at AT TIME ZONE 'Asia/Taipei')::date=v_day
     AND line.value->>'id'=v_id::text;
   IF v_used+v_qty>v_limit THEN RAISE EXCEPTION '餐點當日剩餘數量不足，請重新整理菜單' USING ERRCODE='23514'; END IF;
 END LOOP;
 RETURN new;
END $$;
DROP TRIGGER IF EXISTS qm_pickup_daily_stock_guard ON public.qm_pickup_orders;
CREATE TRIGGER qm_pickup_daily_stock_guard BEFORE INSERT OR UPDATE OF items,status,pickup_at
ON public.qm_pickup_orders FOR EACH ROW EXECUTE FUNCTION private.qm_pickup_stock_guard();

CREATE TABLE IF NOT EXISTS public.qm_pickup_groups(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.qm_tenants(id),
 owner_user_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT (now()+interval '24 hours'),
 submitted_order_id uuid REFERENCES public.qm_pickup_orders(id),
 CONSTRAINT qm_pickup_group_expiry_check CHECK(expires_at>created_at)
);
CREATE INDEX IF NOT EXISTS qm_pickup_groups_tenant_date ON public.qm_pickup_groups(tenant_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.qm_pickup_group_lines(
 group_id uuid NOT NULL REFERENCES public.qm_pickup_groups(id) ON DELETE CASCADE,
 user_id uuid NOT NULL,
 items jsonb NOT NULL DEFAULT '[]'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(group_id,user_id)
);
ALTER TABLE public.qm_pickup_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qm_pickup_group_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.qm_pickup_groups,public.qm_pickup_group_lines FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.qm_pickup_group_authorize(p_slug text,p_group uuid)
RETURNS public.qm_pickup_groups LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.qm_pickup_groups;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION '請先登入' USING ERRCODE='28000'; END IF;
 SELECT gg.* INTO g FROM public.qm_pickup_groups gg JOIN public.qm_tenants t ON t.id=gg.tenant_id
 WHERE gg.id=p_group AND t.slug=p_slug AND t.status='ACTIVE';
 IF NOT FOUND THEN RAISE EXCEPTION '團購連結不存在'; END IF;
 IF g.expires_at<=now() THEN RAISE EXCEPTION '團購連結已過期'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.qm_line_links l WHERE l.tenant_id=g.tenant_id AND l.user_id=auth.uid())
 AND NOT EXISTS(SELECT 1 FROM public.qm_members m WHERE m.tenant_id=g.tenant_id AND m.user_id=auth.uid())
 AND NOT coalesce(private.so_platform(),false) THEN
  RAISE EXCEPTION '請先完成本店顧客身分綁定' USING ERRCODE='42501';
 END IF;
 RETURN g;
END $$;
REVOKE ALL ON FUNCTION private.qm_pickup_group_authorize(text,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.so_pickup_group_create(p_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t uuid;g public.qm_pickup_groups;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION '請先登入' USING ERRCODE='28000'; END IF;
 SELECT id INTO t FROM public.qm_tenants WHERE slug=p_slug AND status='ACTIVE';
 IF t IS NULL OR NOT EXISTS(SELECT 1 FROM public.qm_pickup_settings s WHERE s.tenant_id=t AND s.enabled) THEN
 RAISE EXCEPTION '此店家未開放訂餐'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.qm_line_links l WHERE l.tenant_id=t AND l.user_id=auth.uid())
 AND NOT EXISTS(SELECT 1 FROM public.qm_members m WHERE m.tenant_id=t AND m.user_id=auth.uid())
 AND NOT coalesce(private.so_platform(),false) THEN
 RAISE EXCEPTION '請先完成本店顧客身分綁定' USING ERRCODE='42501'; END IF;
 INSERT INTO public.qm_pickup_groups(tenant_id,owner_user_id) VALUES(t,auth.uid()) RETURNING * INTO g;
 RETURN jsonb_build_object('id',g.id,'expires_at',g.expires_at);
END $$;

CREATE OR REPLACE FUNCTION public.so_pickup_group_save(p_slug text,p_group uuid,p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.qm_pickup_groups;e jsonb;
BEGIN
 g:=private.qm_pickup_group_authorize(p_slug,p_group);
 PERFORM 1 FROM public.qm_pickup_groups WHERE id=g.id FOR UPDATE;
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
END $$;

CREATE OR REPLACE FUNCTION public.so_pickup_group_view(p_slug text,p_group uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.qm_pickup_groups;v_lines jsonb; v_order jsonb;
BEGIN
 g:=private.qm_pickup_group_authorize(p_slug,p_group);
 SELECT coalesce(jsonb_agg(jsonb_build_object('mine',l.user_id=auth.uid(),
  'name',coalesce(nullif(link.display_name,''),'參與者'),
  'items',l.items) ORDER BY l.updated_at),'[]'::jsonb)
 INTO v_lines FROM public.qm_pickup_group_lines l
 LEFT JOIN public.qm_line_links link ON link.tenant_id=g.tenant_id AND link.user_id=l.user_id
 WHERE l.group_id=g.id;
 SELECT jsonb_build_object('number','P'||lpad(o.order_no::text,5,'0'),'status',o.status)
 INTO v_order FROM public.qm_pickup_orders o WHERE o.id=g.submitted_order_id AND o.tenant_id=g.tenant_id;
 RETURN jsonb_build_object('id',g.id,'owner',g.owner_user_id=auth.uid(),
 'submitted',g.submitted_order_id IS NOT NULL,'expires_at',g.expires_at,
 'participants',v_lines,'order',v_order);
END $$;

CREATE OR REPLACE FUNCTION public.so_pickup_group_submit(
 p_slug text,p_group uuid,p_date date,p_time time without time zone,
 p_note text,p_immediate boolean,p_customer_phone text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.qm_pickup_groups; v_items jsonb; v_result jsonb;
BEGIN
 g:=private.qm_pickup_group_authorize(p_slug,p_group);
 SELECT * INTO g FROM public.qm_pickup_groups WHERE id=g.id FOR UPDATE;
 IF g.owner_user_id<>auth.uid() THEN RAISE EXCEPTION '只有主揪可以送出整張訂單' USING ERRCODE='42501'; END IF;
 IF g.submitted_order_id IS NOT NULL THEN
  SELECT jsonb_build_object('id',o.id,'number','P'||lpad(o.order_no::text,5,'0'),'existing',true)
  INTO v_result FROM public.qm_pickup_orders o WHERE o.id=g.submitted_order_id;
  RETURN v_result;
 END IF;
 SELECT coalesce(jsonb_agg(x.value),'[]'::jsonb) INTO v_items
 FROM public.qm_pickup_group_lines l CROSS JOIN LATERAL jsonb_array_elements(l.items) x
 WHERE l.group_id=g.id;
 IF jsonb_array_length(v_items) NOT BETWEEN 1 AND 20 THEN
 RAISE EXCEPTION '團購總餐點應為 1～20 種規格，請先整理大家的餐點'; END IF;
 SELECT public.so_pickup_place_phone(p_slug,p_date,p_time,v_items,p_note,g.id,p_immediate,p_customer_phone)
 INTO v_result;
 UPDATE public.qm_pickup_groups SET submitted_order_id=(v_result->>'id')::uuid WHERE id=g.id;
 RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.so_pickup_repeat_customers(p_slug text,p_limit integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t uuid;v_result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION '請先登入' USING ERRCODE='28000'; END IF;
 SELECT id INTO t FROM public.qm_tenants WHERE slug=p_slug AND status='ACTIVE';
 IF t IS NULL OR (coalesce(private.so_role(t),'') NOT IN ('OWNER','MANAGER')
 AND NOT coalesce(private.so_platform(),false)) THEN RAISE EXCEPTION '僅管理者可查看熟客分析' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'name',coalesce(nullif(l.display_name,''),'顧客（'||right(coalesce(s.phone,''),4)||'）'),
 'orders',s.orders,'amount',s.amount,'last_order',s.last_order,'favorite',(
  SELECT m.value->>'name' FROM public.qm_pickup_orders oo
  CROSS JOIN LATERAL jsonb_array_elements(oo.items) m
  WHERE oo.tenant_id=t AND oo.user_id=s.user_id AND oo.status NOT IN ('CANCELLED','REJECTED')
  GROUP BY m.value->>'name' ORDER BY sum((m.value->>'qty')::integer) DESC LIMIT 1
 )) ORDER BY s.orders DESC,s.last_order DESC),'[]'::jsonb) INTO v_result
 FROM (SELECT user_id,count(*)::integer orders,round(sum(total),2) amount,
 max(created_at) last_order,max(customer_phone) phone
 FROM public.qm_pickup_orders WHERE tenant_id=t AND status NOT IN ('CANCELLED','REJECTED')
 GROUP BY user_id ORDER BY count(*) DESC,max(created_at) DESC
 LIMIT greatest(1,least(coalesce(p_limit,30),100))) s
 LEFT JOIN public.qm_line_links l ON l.tenant_id=t AND l.user_id=s.user_id;
 RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.so_pickup_group_create(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.so_pickup_group_save(text,uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.so_pickup_group_view(text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.so_pickup_group_submit(text,uuid,date,time without time zone,text,boolean,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.so_pickup_repeat_customers(text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.so_pickup_group_create(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.so_pickup_group_save(text,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.so_pickup_group_view(text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.so_pickup_group_submit(text,uuid,date,time without time zone,text,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.so_pickup_repeat_customers(text,integer) TO authenticated;
