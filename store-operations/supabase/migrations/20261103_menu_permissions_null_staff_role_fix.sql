CREATE OR REPLACE FUNCTION public.so_menu_save(p_slug text, p_kind text, p_name text, p_description text, p_price numeric, p_sort_order integer, p_active boolean, p_item_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants; item public.so_menu_items;
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 select * into t from public.so_tenants where slug=p_slug for update;
 if not found then raise exception '找不到企業';end if;
 if coalesce(private.so_role(t.id),'') not in ('OWNER','MANAGER') and not coalesce(private.so_platform(),false) then
  raise exception '僅門市負責人或管理員可修改菜單及服務' using errcode='42501';end if;
 if p_kind not in('MENU','SERVICE') then raise exception '請選擇餐點或服務';end if;
 if length(btrim(coalesce(p_name,''))) not between 1 and 100 then raise exception '名稱需為 1 至 100 個字';end if;
 if length(coalesce(p_description,''))>500 then raise exception '說明請勿超過 500 字';end if;
 if p_price<0 or p_price>99999999 then raise exception '價格不可小於 0 或超出上限';end if;
 if coalesce(p_sort_order,0) not between -9999 and 9999 then raise exception '排序數值無效';end if;
 if p_item_id is null then
  insert into public.so_menu_items(tenant_id,kind,name,description,price,sort_order,active)
  values(t.id,p_kind,btrim(p_name),coalesce(p_description,''),p_price,coalesce(p_sort_order,0),coalesce(p_active,true))
  returning * into item;
 else
  update public.so_menu_items set kind=p_kind,name=btrim(p_name),description=coalesce(p_description,''),
   price=p_price,sort_order=coalesce(p_sort_order,0),active=coalesce(p_active,true),updated_at=now()
  where tenant_id=t.id and id=p_item_id returning * into item;
  if not found then raise exception '找不到要編輯的項目';end if;
 end if;
 insert into public.so_audit(tenant_id,actor,action,info)
 values(t.id,auth.uid(),'menu_save',jsonb_build_object('item_id',item.id,'kind',item.kind,'active',item.active));
 return jsonb_build_object('id',item.id,'name',item.name,'active',item.active);
end $function$
;
CREATE OR REPLACE FUNCTION public.so_menu_set_modes(p_slug text, p_booking_mode text, p_queue_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants;
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 select * into t from public.so_tenants where slug=p_slug for update;
 if not found then raise exception '找不到企業';end if;
 if coalesce(private.so_role(t.id),'') not in ('OWNER','MANAGER') and not coalesce(private.so_platform(),false) then
  raise exception '僅門市負責人或管理員可修改選擇規則' using errcode='42501';end if;
 if p_booking_mode not in ('REQUIRED','OPTIONAL','DISABLED')
  or p_queue_mode not in ('REQUIRED','OPTIONAL','DISABLED') then
  raise exception '請選擇必填、選填或不開放填寫';end if;
 if (p_booking_mode='REQUIRED' or p_queue_mode='REQUIRED') and
   not exists(select 1 from public.so_menu_items where tenant_id=t.id and active) then
    raise exception '請先新增並啟用至少一項菜單或服務，再設定必填';end if;
 update public.so_tenants set menu_booking_mode=p_booking_mode,menu_queue_mode=p_queue_mode,
  updated_at=now() where id=t.id;
 insert into public.so_audit(tenant_id,actor,action,info)
 values(t.id,auth.uid(),'menu_set_modes',jsonb_build_object('booking',p_booking_mode,'queue',p_queue_mode));
 return jsonb_build_object('booking',p_booking_mode,'queue',p_queue_mode);
end $function$
;
