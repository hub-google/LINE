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
 if p_item_id is not null and not coalesce(p_active,true)
    and (t.menu_booking_mode='REQUIRED' or t.menu_queue_mode='REQUIRED')
    and not exists(select 1 from public.so_menu_items where tenant_id=t.id and active and id<>p_item_id)
 then raise exception '預約或取號目前設為必填，請先上架另一項餐點／服務，或調整選擇規則';end if;
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
