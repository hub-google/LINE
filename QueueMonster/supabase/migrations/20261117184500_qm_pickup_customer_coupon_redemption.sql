
-- Per-merchant coupon campaigns for paid-at-store pickup orders.
-- All prices and discounts are validated and recomputed server-side, not trusted from browser.
ALTER TABLE public.qm_pickup_orders
 ADD COLUMN IF NOT EXISTS coupon_code text,
 ADD COLUMN IF NOT EXISTS coupon_discount numeric(12,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.qm_pickup_coupons(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.qm_tenants(id),
 code text NOT NULL,
 discount_amount numeric(12,2) NOT NULL,
 minimum_amount numeric(12,2) NOT NULL DEFAULT 0,
 max_uses integer NOT NULL DEFAULT 100,
 starts_at timestamptz NOT NULL DEFAULT now(),
 ends_at timestamptz NOT NULL DEFAULT (now()+interval '90 days'),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,code),
 CONSTRAINT qm_pickup_coupon_code_check CHECK (code ~ '^[A-Z0-9-]{4,24}$'),
 CONSTRAINT qm_pickup_coupon_discount_check CHECK (discount_amount>0 AND discount_amount<=10000),
 CONSTRAINT qm_pickup_coupon_minimum_check CHECK (minimum_amount>=0 AND minimum_amount<=100000),
 CONSTRAINT qm_pickup_coupon_uses_check CHECK (max_uses BETWEEN 1 AND 100000),
 CONSTRAINT qm_pickup_coupon_dates_check CHECK (ends_at>starts_at)
);
CREATE TABLE IF NOT EXISTS public.qm_pickup_coupon_uses(
 tenant_id uuid NOT NULL REFERENCES public.qm_tenants(id),
 coupon_id uuid NOT NULL REFERENCES public.qm_pickup_coupons(id),
 order_id uuid NOT NULL UNIQUE REFERENCES public.qm_pickup_orders(id),
 user_id uuid NOT NULL,
 used_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,coupon_id,user_id)
);
CREATE INDEX IF NOT EXISTS qm_pickup_coupon_uses_coupon ON public.qm_pickup_coupon_uses(coupon_id);
ALTER TABLE public.qm_pickup_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qm_pickup_coupon_uses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.qm_pickup_coupons,public.qm_pickup_coupon_uses FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.so_pickup_coupon_save(
 p_slug text,p_code text,p_discount numeric,p_minimum numeric,
 p_max_uses integer,p_ends_at timestamptz,p_active boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t uuid;v_code text:=upper(btrim(coalesce(p_code,'')));c public.qm_pickup_coupons;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION '請先登入' USING ERRCODE='28000';END IF;
 SELECT id INTO t FROM public.qm_tenants WHERE slug=p_slug AND status='ACTIVE';
 IF t IS NULL OR (coalesce(private.so_role(t),'') NOT IN ('OWNER','MANAGER')
 AND NOT coalesce(private.so_platform(),false)) THEN
 RAISE EXCEPTION '只有店家管理者可設定優惠碼' USING ERRCODE='42501';END IF;
 IF v_code !~ '^[A-Z0-9-]{4,24}$'
 OR p_discount IS NULL OR p_discount<=0 OR p_discount>10000
 OR p_minimum IS NULL OR p_minimum<0 OR p_minimum>100000
 OR p_max_uses IS NULL OR p_max_uses NOT BETWEEN 1 AND 100000
 OR p_ends_at IS NULL OR p_ends_at<=now() THEN
 RAISE EXCEPTION '優惠碼需 4～24 個英數或連字號，請確認折抵、門檻、次數和到期日';END IF;
 INSERT INTO public.qm_pickup_coupons(tenant_id,code,discount_amount,minimum_amount,max_uses,ends_at,active)
 VALUES(t,v_code,p_discount,p_minimum,p_max_uses,p_ends_at,coalesce(p_active,true))
 ON CONFLICT(tenant_id,code) DO UPDATE SET
 discount_amount=excluded.discount_amount,minimum_amount=excluded.minimum_amount,
 max_uses=excluded.max_uses,ends_at=excluded.ends_at,
 active=excluded.active,updated_at=now()
 RETURNING * INTO c;
 INSERT INTO public.qm_audit(tenant_id,actor,action,info)VALUES
 (t,auth.uid(),'pickup_coupon_saved',jsonb_build_object('coupon',v_code,'active',c.active));
 RETURN jsonb_build_object('saved',true,'code',v_code);
END $$;

CREATE OR REPLACE FUNCTION public.so_pickup_coupon_admin(p_slug text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE t uuid;result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION '請先登入' USING ERRCODE='28000';END IF;
 SELECT id INTO t FROM public.qm_tenants WHERE slug=p_slug AND status='ACTIVE';
 IF t IS NULL OR (coalesce(private.so_role(t),'') NOT IN ('OWNER','MANAGER')
 AND NOT coalesce(private.so_platform(),false)) THEN RAISE EXCEPTION '只有店家管理者可管理優惠碼' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('code',c.code,'discount',c.discount_amount,
 'minimum',c.minimum_amount,'max_uses',c.max_uses,
 'uses',(select count(*) from public.qm_pickup_coupon_uses u where u.coupon_id=c.id),
 'ends_at',to_char(c.ends_at at time zone 'Asia/Taipei','YYYY-MM-DD'),
 'active',c.active) ORDER BY c.created_at DESC),'[]'::jsonb) INTO result
 FROM public.qm_pickup_coupons c WHERE c.tenant_id=t;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.so_pickup_coupon_preview(
 p_slug text,p_code text,p_estimated_total numeric
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE t uuid;c public.qm_pickup_coupons;v_used integer;v_code text:=upper(btrim(coalesce(p_code,'')));
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION '請先登入' USING ERRCODE='28000';END IF;
 SELECT id INTO t FROM public.qm_tenants WHERE slug=p_slug AND status='ACTIVE';
 IF t IS NULL THEN RAISE EXCEPTION '店家不存在';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.qm_line_links l WHERE l.tenant_id=t AND l.user_id=auth.uid())
 AND NOT EXISTS(SELECT 1 FROM public.qm_members m WHERE m.tenant_id=t AND m.user_id=auth.uid())
 AND NOT coalesce(private.so_platform(),false)
 THEN RAISE EXCEPTION '請先完成本店顧客身分綁定' USING ERRCODE='42501';END IF;
 IF p_estimated_total IS NULL OR p_estimated_total<0 OR p_estimated_total>2000000
 THEN RAISE EXCEPTION '訂單金額無效';END IF;
 SELECT * INTO c FROM public.qm_pickup_coupons WHERE tenant_id=t AND code=v_code
 AND active AND starts_at<=now() AND ends_at>now();
 IF NOT FOUND THEN RAISE EXCEPTION '優惠碼不存在、未開始或已過期';END IF;
 SELECT count(*) INTO v_used FROM public.qm_pickup_coupon_uses WHERE coupon_id=c.id;
 IF v_used>=c.max_uses THEN RAISE EXCEPTION '優惠碼使用次數已滿';END IF;
 IF EXISTS(SELECT 1 FROM public.qm_pickup_coupon_uses WHERE tenant_id=t
 AND coupon_id=c.id AND user_id=auth.uid()) THEN RAISE EXCEPTION '你已使用過此優惠碼';END IF;
 IF p_estimated_total<c.minimum_amount THEN RAISE EXCEPTION '訂單金額未達優惠碼使用門檻';END IF;
 RETURN jsonb_build_object('code',c.code,'discount',least(p_estimated_total,c.discount_amount),
 'minimum',c.minimum_amount,'estimated_payable',greatest(0,p_estimated_total-c.discount_amount));
END $$;

CREATE OR REPLACE FUNCTION public.so_pickup_place_with_coupon(
 p_slug text,p_date date,p_time time without time zone,
 p_items jsonb,p_note text,p_request_id uuid,p_immediate boolean,
 p_customer_phone text,p_coupon_code text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t uuid;c public.qm_pickup_coupons;v_used integer;v_result jsonb;
 v_order public.qm_pickup_orders;v_discount numeric(12,2);
 v_code text:=upper(btrim(coalesce(p_coupon_code,'')));
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION '請先登入' USING ERRCODE='28000';END IF;
 SELECT id INTO t FROM public.qm_tenants WHERE slug=p_slug AND status='ACTIVE';
 IF t IS NULL THEN RAISE EXCEPTION '店家不存在';END IF;
 SELECT * INTO c FROM public.qm_pickup_coupons WHERE tenant_id=t AND code=v_code FOR UPDATE;
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
END $$;

REVOKE ALL ON FUNCTION public.so_pickup_coupon_save(text,text,numeric,numeric,integer,timestamptz,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.so_pickup_coupon_admin(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.so_pickup_coupon_preview(text,text,numeric) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.so_pickup_place_with_coupon(text,date,time without time zone,jsonb,text,uuid,boolean,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.so_pickup_coupon_save(text,text,numeric,numeric,integer,timestamptz,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.so_pickup_coupon_admin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.so_pickup_coupon_preview(text,text,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.so_pickup_place_with_coupon(text,date,time without time zone,jsonb,text,uuid,boolean,text,text) TO authenticated;
