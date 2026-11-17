-- Keep coupon submission idempotent both before and after acquiring the campaign lock.
CREATE OR REPLACE FUNCTION public.so_pickup_place_with_coupon(p_slug text, p_date date, p_time time without time zone, p_items jsonb, p_note text, p_request_id uuid, p_immediate boolean, p_customer_phone text, p_coupon_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE t uuid;c public.qm_pickup_coupons;v_used integer;v_result jsonb;v_prior public.qm_pickup_orders;
 v_order public.qm_pickup_orders;v_discount numeric(12,2);
 v_code text:=upper(btrim(coalesce(p_coupon_code,'')));
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION '請先登入' USING ERRCODE='28000';END IF;
 SELECT id INTO t FROM public.qm_tenants WHERE slug=p_slug AND status='ACTIVE';
 IF t IS NULL THEN RAISE EXCEPTION '店家不存在';END IF;
 IF p_request_id IS NULL THEN RAISE EXCEPTION '缺少下單識別碼';END IF;
 SELECT * INTO v_prior FROM public.qm_pickup_orders
 WHERE tenant_id=t AND user_id=auth.uid() AND request_id=p_request_id;
 IF FOUND THEN RETURN jsonb_build_object('id',v_prior.id,'number','P'||lpad(v_prior.order_no::text,5,'0'),'existing',true);END IF;
 SELECT * INTO c FROM public.qm_pickup_coupons WHERE tenant_id=t AND code=v_code FOR UPDATE;
 IF p_request_id IS NULL THEN RAISE EXCEPTION '缺少下單識別碼';END IF;
 SELECT * INTO v_prior FROM public.qm_pickup_orders
 WHERE tenant_id=t AND user_id=auth.uid() AND request_id=p_request_id;
 IF FOUND THEN RETURN jsonb_build_object('id',v_prior.id,'number','P'||lpad(v_prior.order_no::text,5,'0'),'existing',true);END IF;
 IF NOT FOUND OR NOT c.active OR c.starts_at>now() OR c.ends_at<=now() THEN
 RAISE EXCEPTION '優惠碼不存在、未開始或已過期';END IF;
 SELECT count(*) INTO v_used FROM public.qm_pickup_coupon_uses WHERE coupon_id=c.id;
 IF v_used>=c.max_uses THEN RAISE EXCEPTION '優惠碼使用次數已滿';END IF;
 IF EXISTS(SELECT 1 FROM public.qm_pickup_coupon_uses WHERE tenant_id=t
 AND coupon_id=c.id AND user_id=auth.uid()) THEN RAISE EXCEPTION '你已使用過此優惠碼';END IF;
 -- The original booking path owns auth, inventory, slot capacity and the final server price.
 SELECT public.so_pickup_place_phone(p_slug,p_date,p_time,p_items,p_note,p_request_id,p_immediate,p_customer_phone)
 INTO v_result;
 IF coalesce((v_result->>'existing')::boolean,false) THEN RETURN v_result;END IF;
 SELECT * INTO v_order FROM public.qm_pickup_orders
 WHERE id=(v_result->>'id')::uuid AND tenant_id=t AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '找不到剛送出的訂單';END IF;
 IF v_order.total<c.minimum_amount THEN RAISE EXCEPTION '實際餐點金額未達優惠碼門檻';END IF;
 v_discount:=least(v_order.total,c.discount_amount);
 UPDATE public.qm_pickup_orders SET coupon_code=c.code,coupon_discount=v_discount,
 total=v_order.total-v_discount,updated_at=now() WHERE id=v_order.id AND tenant_id=t;
 INSERT INTO public.qm_pickup_coupon_uses(tenant_id,coupon_id,order_id,user_id)
 VALUES(t,c.id,v_order.id,auth.uid());
 INSERT INTO public.qm_audit(tenant_id,actor,action,info)
 VALUES(t,auth.uid(),'pickup_coupon_used',
 jsonb_build_object('order_id',v_order.id,'code',c.code,'discount',v_discount));
 RETURN v_result||jsonb_build_object('coupon',c.code,'discount',v_discount);
END $function$
;
