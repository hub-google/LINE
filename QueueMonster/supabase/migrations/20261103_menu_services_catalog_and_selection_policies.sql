create table if not exists public.so_menu_items (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.so_tenants(id) on delete cascade,
 kind text not null check(kind in ('MENU','SERVICE')),
 name text not null check(char_length(btrim(name)) between 1 and 100),
 description text not null default '',
 price numeric(12,2) check(price is null or price>=0),
 sort_order integer not null default 0,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists so_menu_items_tenant_order on public.so_menu_items(tenant_id,active,sort_order,id);
alter table public.so_menu_items enable row level security;
revoke all on public.so_menu_items from public,anon,authenticated;
alter table public.so_tenants
 add column if not exists menu_booking_mode text not null default 'DISABLED'
   check(menu_booking_mode in ('REQUIRED','OPTIONAL','DISABLED')),
 add column if not exists menu_queue_mode text not null default 'DISABLED'
   check(menu_queue_mode in ('REQUIRED','OPTIONAL','DISABLED'));
alter table public.so_reservations
 add column if not exists selected_items jsonb not null default '[]'::jsonb
 check(jsonb_typeof(selected_items)='array');
alter table public.so_tickets
 add column if not exists selected_items jsonb not null default '[]'::jsonb
 check(jsonb_typeof(selected_items)='array');

create or replace function private.so_menu_validate_items(p_tenant uuid, p_flow text, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $body$
declare v_mode text; v_item uuid; v_catalog public.so_menu_items; v_out jsonb:='[]'::jsonb; v_raw text; v_seen uuid[]:='{}'::uuid[]; v_count integer;
begin
 if p_flow not in ('BOOKING','QUEUE') then raise exception '不支援的選擇類型';end if;
 if p_items is null then p_items:='[]'::jsonb;end if;
 if jsonb_typeof(p_items)<>'array' then raise exception '菜單或服務資料格式錯誤';end if;
 v_count:=jsonb_array_length(p_items);
 if v_count>20 then raise exception '最多可選擇 20 項餐點或服務';end if;
 select case when p_flow='BOOKING' then menu_booking_mode else menu_queue_mode end into v_mode
  from public.so_tenants where id=p_tenant;
 if v_mode is null then raise exception '找不到門市';end if;
 if v_mode='DISABLED' then
   if v_count>0 then raise exception '此門市目前沒有開放選擇菜單或服務';end if;
   return '[]'::jsonb;
 end if;
 if v_mode='REQUIRED' and v_count=0 then raise exception '請先選擇至少一項餐點或服務';end if;
 for v_raw in select jsonb_array_elements_text(p_items) loop
   if v_raw !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception '菜單或服務代碼格式不正確';
   end if;
   v_item:=v_raw::uuid;
   if v_item=any(v_seen) then raise exception '同一項餐點或服務不可重複選取';end if;
   v_seen:=array_append(v_seen,v_item);
   select * into v_catalog from public.so_menu_items
     where id=v_item and tenant_id=p_tenant and active=true;
   if not found then raise exception '選擇的餐點或服務已下架，請重新選擇';end if;
   v_out:=v_out||jsonb_build_array(jsonb_build_object(
      'id',v_catalog.id,'kind',v_catalog.kind,'name',v_catalog.name,'price',v_catalog.price));
 end loop;
 return v_out;
end $body$;
revoke all on function private.so_menu_validate_items(uuid,text,jsonb) from public,anon,authenticated;

create or replace function public.so_menu_save(
 p_slug text,p_kind text,p_name text,p_description text,
 p_price numeric,p_sort_order integer,p_active boolean,p_item_id uuid default null
) returns jsonb language plpgsql security definer set search_path = ''
as $body$
declare t public.so_tenants; item public.so_menu_items;
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 select * into t from public.so_tenants where slug=p_slug for update;
 if not found then raise exception '找不到企業';end if;
 if private.so_role(t.id) not in ('OWNER','MANAGER') and not private.so_platform() then
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
end $body$;
revoke all on function public.so_menu_save(text,text,text,text,numeric,integer,boolean,uuid) from public,anon;
grant execute on function public.so_menu_save(text,text,text,text,numeric,integer,boolean,uuid) to authenticated;

create or replace function public.so_menu_set_modes(p_slug text,p_booking_mode text,p_queue_mode text)
returns jsonb language plpgsql security definer set search_path = ''
as $body$
declare t public.so_tenants;
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 select * into t from public.so_tenants where slug=p_slug for update;
 if not found then raise exception '找不到企業';end if;
 if private.so_role(t.id) not in ('OWNER','MANAGER') and not private.so_platform() then
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
end $body$;
revoke all on function public.so_menu_set_modes(text,text,text) from public,anon;
grant execute on function public.so_menu_set_modes(text,text,text) to authenticated;
