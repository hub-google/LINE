
-- Pickup ordering uses the existing merchant and so_menu_items catalogue.
-- No payments, second menu, or changes to reservation/queue ticket state machines.
create table if not exists public.so_pickup_settings (
 tenant_id uuid primary key references public.so_tenants(id) on delete cascade,
 enabled boolean not null default false,
 schedule_mode text not null default 'REQUIRED' check (schedule_mode in ('DISABLED','OPTIONAL','REQUIRED')),
 pickup_start time not null default '05:30',
 pickup_end time not null default '14:00',
 interval_minutes integer not null default 15 check(interval_minutes in(5,10,15,20,30,60)),
 slot_capacity integer not null default 5 check(slot_capacity between 1 and 300),
 min_notice_minutes integer not null default 20 check(min_notice_minutes between 0 and 1440),
 days_ahead integer not null default 7 check(days_ahead between 0 and 30),
 prep_minutes integer not null default 20 check(prep_minutes between 1 and 180),
 updated_at timestamptz not null default now(),
 constraint pickup_hours_valid check (pickup_end > pickup_start)
);
alter table public.so_pickup_settings enable row level security;
revoke all on public.so_pickup_settings from public,anon,authenticated;
create table if not exists public.so_pickup_orders (
 id uuid primary key default gen_random_uuid(),
 order_no bigint generated always as identity unique,
 tenant_id uuid not null references public.so_tenants(id) on delete cascade,
 user_id uuid not null references auth.users(id),
 request_id uuid not null,
 scheduled boolean not null,
 pickup_at timestamptz not null,
 status text not null default 'NEW' check(status in ('NEW','ACCEPTED','PREPARING','READY','PICKED_UP','CANCELLED','REJECTED')),
 items jsonb not null check(jsonb_typeof(items)='array'),
 total numeric(12,2) not null check(total >= 0),
 note text not null default '' check(char_length(note)<=200),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(tenant_id,user_id,request_id)
);
create index if not exists so_pickup_orders_staff on public.so_pickup_orders(tenant_id,pickup_at,status);
create index if not exists so_pickup_orders_mine on public.so_pickup_orders(tenant_id,user_id,created_at desc);
alter table public.so_pickup_orders enable row level security;
revoke all on public.so_pickup_orders from public,anon,authenticated;

create or replace function public.so_pickup_public(p_slug text,p_date date default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare t public.so_tenants; s public.so_pickup_settings; v_today date:=(now() at time zone 'Asia/Taipei')::date;
 v_date date:=coalesce(p_date,(now() at time zone 'Asia/Taipei')::date); v_slots jsonb:='[]'::jsonb;
 v_catalog jsonb:='[]'::jsonb; v_orders jsonb:='[]'::jsonb;
begin
 if auth.uid() is null then raise exception '請先登入' using errcode='28000';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '找不到營業中的門市';end if;
 if not exists(select 1 from public.so_line_links l where l.tenant_id=t.id and l.user_id=auth.uid())
   and not exists(select 1 from public.so_members m where m.tenant_id=t.id and m.user_id=auth.uid())
   and not coalesce(private.so_platform(),false)
 then raise exception '請先完成本店 LINE 身分綁定' using errcode='42501';end if;
 select * into s from public.so_pickup_settings where tenant_id=t.id;
 if not found then
  s.tenant_id:=t.id;s.enabled:=false;s.schedule_mode:='REQUIRED';s.pickup_start:=t.open_time;s.pickup_end:=t.close_time;
  s.interval_minutes:=15;s.slot_capacity:=5;s.min_notice_minutes:=20;s.days_ahead:=7;s.prep_minutes:=20;
 end if;
 if v_date>=v_today and v_date<=v_today+s.days_ahead and s.enabled and s.schedule_mode<>'DISABLED' then
  select coalesce(jsonb_agg(jsonb_build_object('time',to_char(ts,'HH24:MI'),'left',greatest(0,s.slot_capacity-
      (select count(*) from public.so_pickup_orders o where o.tenant_id=t.id and o.scheduled
       and (o.pickup_at at time zone 'Asia/Taipei')::date=v_date
       and to_char(o.pickup_at at time zone 'Asia/Taipei','HH24:MI')=to_char(ts,'HH24:MI')
       and o.status not in('REJECTED','CANCELLED')))) order by ts),'[]'::jsonb) into v_slots
  from generate_series((v_date+s.pickup_start)::timestamp,
       (v_date+s.pickup_end)::timestamp - make_interval(mins=>s.interval_minutes),
       make_interval(mins=>s.interval_minutes)) ts
  where ts at time zone 'Asia/Taipei' >= now()+make_interval(mins=>s.min_notice_minutes);
 end if;
 if s.enabled then
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'kind',m.kind,'description',m.description,
   'price',m.price,'sort_order',m.sort_order) order by m.sort_order,m.created_at),'[]'::jsonb) into v_catalog
  from public.so_menu_items m where m.tenant_id=t.id and m.active and m.kind<>'SERVICE' and m.price is not null;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'number','P'||lpad(o.order_no::text,5,'0'),
  'status',o.status,'items',o.items,'total',o.total,'note',o.note,'scheduled',o.scheduled,
  'pickup_at',to_char(o.pickup_at at time zone 'Asia/Taipei','YYYY-MM-DD HH24:MI'),'created_at',o.created_at)
  order by o.created_at desc),'[]'::jsonb) into v_orders
 from (select * from public.so_pickup_orders
       where tenant_id=t.id and user_id=auth.uid() order by created_at desc limit 30) o;
 return jsonb_build_object('settings',jsonb_build_object('enabled',s.enabled,'schedule_mode',s.schedule_mode,
    'pickup_start',to_char(s.pickup_start,'HH24:MI'),'pickup_end',to_char(s.pickup_end,'HH24:MI'),
    'interval_minutes',s.interval_minutes,'slot_capacity',s.slot_capacity,'min_notice_minutes',s.min_notice_minutes,
    'days_ahead',s.days_ahead,'prep_minutes',s.prep_minutes),
    'day',v_date,'slots',v_slots,'items',v_catalog,'orders',v_orders);
end $$;

create or replace function public.so_pickup_staff(p_slug text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare t public.so_tenants;s public.so_pickup_settings;v_orders jsonb;
begin
 if auth.uid() is null then raise exception '請先登入' using errcode='28000';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '找不到營業中的門市';end if;
 if private.so_role(t.id) is null and not coalesce(private.so_platform(),false) then
  raise exception '沒有這家店的操作權限' using errcode='42501';end if;
 select * into s from public.so_pickup_settings where tenant_id=t.id;
 if not found then
  s.tenant_id:=t.id;s.enabled:=false;s.schedule_mode:='REQUIRED';s.pickup_start:=t.open_time;s.pickup_end:=t.close_time;
  s.interval_minutes:=15;s.slot_capacity:=5;s.min_notice_minutes:=20;s.days_ahead:=7;s.prep_minutes:=20;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'number','P'||lpad(o.order_no::text,5,'0'),
 'scheduled',o.scheduled,'status',o.status,'items',o.items,'total',o.total,'note',o.note,
 'pickup_at',to_char(o.pickup_at at time zone 'Asia/Taipei','YYYY-MM-DD HH24:MI'),
 'prepare_at',to_char((o.pickup_at-make_interval(mins=>s.prep_minutes)) at time zone 'Asia/Taipei','YYYY-MM-DD HH24:MI'),
 'can_prepare',not o.scheduled or now()>=o.pickup_at-make_interval(mins=>s.prep_minutes),
 'created_at',o.created_at) order by o.pickup_at,o.created_at),'[]'::jsonb) into v_orders
 from (select * from public.so_pickup_orders
       where tenant_id=t.id and (status not in('PICKED_UP','CANCELLED','REJECTED') or created_at>=now()-interval '48 hours')
       order by pickup_at,created_at limit 300) o;
 return jsonb_build_object('settings',jsonb_build_object('enabled',s.enabled,'schedule_mode',s.schedule_mode,
  'pickup_start',to_char(s.pickup_start,'HH24:MI'),'pickup_end',to_char(s.pickup_end,'HH24:MI'),
  'interval_minutes',s.interval_minutes,'slot_capacity',s.slot_capacity,'min_notice_minutes',s.min_notice_minutes,
  'days_ahead',s.days_ahead,'prep_minutes',s.prep_minutes),'orders',v_orders);
end $$;

create or replace function public.so_pickup_save_settings(
 p_slug text,p_enabled boolean,p_mode text,p_start time,p_end time,p_interval integer,
 p_capacity integer,p_notice integer,p_days integer,p_prep integer)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare t public.so_tenants;
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '找不到營業中的門市';end if;
 if coalesce(private.so_role(t.id),'') not in ('OWNER','MANAGER') and not coalesce(private.so_platform(),false) then
  raise exception '只有店家管理者可修改取餐設定' using errcode='42501';end if;
 if p_mode not in('DISABLED','OPTIONAL','REQUIRED') or p_start is null or p_end is null or p_end<=p_start or
  p_interval not in(5,10,15,20,30,60) or p_capacity not between 1 and 300 or
  p_notice not between 0 and 1440 or p_days not between 0 and 30 or p_prep not between 1 and 180 then
  raise exception '取餐時間、間隔或接單規則無效';end if;
 insert into public.so_pickup_settings(tenant_id,enabled,schedule_mode,pickup_start,pickup_end,interval_minutes,
    slot_capacity,min_notice_minutes,days_ahead,prep_minutes)
 values(t.id,coalesce(p_enabled,false),p_mode,p_start,p_end,p_interval,p_capacity,p_notice,p_days,p_prep)
 on conflict (tenant_id) do update set enabled=excluded.enabled,schedule_mode=excluded.schedule_mode,
   pickup_start=excluded.pickup_start,pickup_end=excluded.pickup_end,interval_minutes=excluded.interval_minutes,
   slot_capacity=excluded.slot_capacity,min_notice_minutes=excluded.min_notice_minutes,
   days_ahead=excluded.days_ahead,prep_minutes=excluded.prep_minutes,updated_at=now();
 insert into public.so_audit(tenant_id,actor,action,info) values(t.id,auth.uid(),'pickup_settings',
  jsonb_build_object('enabled',p_enabled,'mode',p_mode));
 return jsonb_build_object('saved',true);
end $$;

create or replace function public.so_pickup_place(
 p_slug text,p_date date,p_time time,p_items jsonb,p_note text,p_request_id uuid,p_immediate boolean default false)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare t public.so_tenants;s public.so_pickup_settings; v_user uuid:=auth.uid();v_now date:=(now() at time zone 'Asia/Taipei')::date;
 v_pickup timestamptz;v_existing public.so_pickup_orders;v_row public.so_menu_items;
 v_e jsonb;v_id uuid;v_qty int;v_total numeric(12,2):=0;v_lines jsonb:='[]'::jsonb;v_count int:=0;
 v_used int;v_result public.so_pickup_orders;v_note text:=btrim(coalesce(p_note,''));
begin
 if v_user is null then raise exception '請先登入' using errcode='28000';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '門市未開放';end if;
 if not exists(select 1 from public.so_line_links l where l.tenant_id=t.id and l.user_id=v_user) then
  raise exception '請先完成本店 LINE 身分綁定' using errcode='42501';end if;
 if p_request_id is null then raise exception '缺少防重複下單識別';end if;
 select * into s from public.so_pickup_settings where tenant_id=t.id for update;
 if not found or not s.enabled then raise exception '店家尚未開放線上點餐';end if;
 select * into v_existing from public.so_pickup_orders where tenant_id=t.id and user_id=v_user and request_id=p_request_id;
 if found then return jsonb_build_object('id',v_existing.id,'number','P'||lpad(v_existing.order_no::text,5,'0'),'existing',true);end if;
 if length(v_note)>200 or p_items is null or jsonb_typeof(p_items)<>'array'
   or jsonb_array_length(p_items) not between 1 and 20 then raise exception '餐點或備註格式錯誤';end if;
 if coalesce(p_immediate,false) then
   if s.schedule_mode='REQUIRED' then raise exception '此店家必須選擇預約取餐時間';end if;
   v_pickup:=now()+make_interval(mins=>s.prep_minutes);
 else
   if s.schedule_mode='DISABLED' then raise exception '此店家不接受預約取餐時間';end if;
   if p_date is null or p_time is null or p_date<v_now or p_date>v_now+s.days_ahead then
      raise exception '選擇的取餐日期不在開放範圍';end if;
   if p_time<s.pickup_start or p_time>=s.pickup_end or
      (extract(epoch from (p_time-s.pickup_start))::integer / 60) % s.interval_minutes<>0 then
      raise exception '此取餐時段未開放';end if;
   v_pickup:=(p_date+p_time) at time zone 'Asia/Taipei';
   if v_pickup<now()+make_interval(mins=>s.min_notice_minutes) then
      raise exception '取餐時間過近，請重新選擇';end if;
   select count(*) into v_used from public.so_pickup_orders o where o.tenant_id=t.id and o.scheduled
    and o.pickup_at=v_pickup and o.status not in('CANCELLED','REJECTED');
   if v_used>=s.slot_capacity then raise exception '此取餐時段已額滿，請選其他時間';end if;
 end if;
 for v_e in select value from jsonb_array_elements(p_items) loop
   if jsonb_typeof(v_e)<>'object' or coalesce(v_e->>'id','') !~
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
     raise exception '餐點代碼格式錯誤';end if;
   v_id:=(v_e->>'id')::uuid;
   if coalesce(v_e->>'qty','') !~ '^[0-9]{1,2}$' then raise exception '餐點數量格式錯誤';end if;
   v_qty:=(v_e->>'qty')::integer;
   if v_qty not between 1 and 20 then raise exception '單品數量須為 1 至 20';end if;
   if exists(select 1 from jsonb_array_elements(v_lines) x where x->>'id'=v_id::text) then raise exception '請合併重複餐點';end if;
   select * into v_row from public.so_menu_items
    where id=v_id and tenant_id=t.id and active=true and kind<>'SERVICE' and price is not null;
   if not found then raise exception '有餐點已停售，請重新整理菜單';end if;
   v_count:=v_count+v_qty;
   if v_count>100 then raise exception '單筆訂單最多 100 份';end if;
   v_total:=v_total+v_row.price*v_qty;
   v_lines:=v_lines||jsonb_build_array(jsonb_build_object('id',v_id,'name',v_row.name,'kind',v_row.kind,
     'qty',v_qty,'unit_price',v_row.price,'amount',v_row.price*v_qty));
 end loop;
 insert into public.so_pickup_orders(tenant_id,user_id,request_id,scheduled,pickup_at,items,total,note)
 values(t.id,v_user,p_request_id,not coalesce(p_immediate,false),v_pickup,v_lines,v_total,v_note)
 returning * into v_result;
 insert into public.so_audit(tenant_id,actor,action,info) values(t.id,v_user,'pickup_order_created',
  jsonb_build_object('order_id',v_result.id,'scheduled',v_result.scheduled));
 return jsonb_build_object('id',v_result.id,'number','P'||lpad(v_result.order_no::text,5,'0'),'existing',false);
end $$;

create or replace function public.so_pickup_update(p_slug text,p_order_id uuid,p_expected text,p_status text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare t public.so_tenants;o public.so_pickup_orders;s public.so_pickup_settings;
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '找不到門市';end if;
 if private.so_role(t.id) is null and not coalesce(private.so_platform(),false) then
   raise exception '沒有這家店的操作權限' using errcode='42501';end if;
 select * into o from public.so_pickup_orders where tenant_id=t.id and id=p_order_id for update;
 if not found then raise exception '找不到訂單';end if;
 if o.status<>p_expected then raise exception '訂單狀態已被其他店員更新，請重新整理';end if;
 if not ((o.status='NEW' and p_status in('ACCEPTED','REJECTED','CANCELLED'))
 or (o.status='ACCEPTED' and p_status in('PREPARING','REJECTED','CANCELLED'))
 or (o.status='PREPARING' and p_status in('READY','CANCELLED'))
 or (o.status='READY' and p_status in('PICKED_UP','PREPARING','CANCELLED'))
 or (o.status='PICKED_UP' and p_status='READY')) then
   raise exception '不允許的訂單狀態轉換';end if;
 if p_status='PREPARING' and o.scheduled then
   select * into s from public.so_pickup_settings where tenant_id=t.id;
   if now()<o.pickup_at-make_interval(mins=>coalesce(s.prep_minutes,20)) then
     raise exception '尚未到建議製作時間，避免餐點過早完成放涼';end if;
 end if;
 update public.so_pickup_orders set status=p_status,updated_at=now() where id=o.id;
 insert into public.so_audit(tenant_id,actor,action,info) values(t.id,auth.uid(),'pickup_order_status',
  jsonb_build_object('order_id',o.id,'from',o.status,'to',p_status));
 return jsonb_build_object('changed',true,'status',p_status);
end $$;

create or replace function public.so_pickup_cancel(p_slug text,p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare t public.so_tenants;o public.so_pickup_orders;
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '找不到門市';end if;
 select * into o from public.so_pickup_orders where tenant_id=t.id and id=p_order_id and user_id=auth.uid() for update;
 if not found then raise exception '無權取消這筆訂單';end if;
 if o.status not in('NEW','ACCEPTED') then raise exception '訂單已開始製作，請聯絡店家處理';end if;
 update public.so_pickup_orders set status='CANCELLED',updated_at=now() where id=o.id;
 insert into public.so_audit(tenant_id,actor,action,info) values(t.id,auth.uid(),'pickup_order_cancelled',
  jsonb_build_object('order_id',o.id));
 return jsonb_build_object('changed',true);
end $$;

-- Existing store-live-sync.js listens to queue-board:<slug>. Send only a marker:
-- never broadcast phone, order contents, LINE identity or payment details.
create or replace function private.so_pickup_broadcast()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_slug text;
begin
 select slug into v_slug from public.so_tenants where id=new.tenant_id and status='ACTIVE';
 if v_slug is not null then
  perform realtime.send(jsonb_build_object('changed',true),'invalidate','queue-board:'||v_slug,false);
 end if;
 return null;
end $$;
drop trigger if exists so_pickup_orders_invalidate on public.so_pickup_orders;
create trigger so_pickup_orders_invalidate after insert or update of status on public.so_pickup_orders
for each row execute function private.so_pickup_broadcast();

revoke all on function private.so_pickup_broadcast() from public,anon,authenticated;
revoke all on function public.so_pickup_public(text,date) from public,anon;
revoke all on function public.so_pickup_staff(text) from public,anon;
revoke all on function public.so_pickup_save_settings(text,boolean,text,time,time,integer,integer,integer,integer,integer) from public,anon;
revoke all on function public.so_pickup_place(text,date,time,jsonb,text,uuid,boolean) from public,anon;
revoke all on function public.so_pickup_update(text,uuid,text,text) from public,anon;
revoke all on function public.so_pickup_cancel(text,uuid) from public,anon;
grant execute on function public.so_pickup_public(text,date) to authenticated;
grant execute on function public.so_pickup_staff(text) to authenticated;
grant execute on function public.so_pickup_save_settings(text,boolean,text,time,time,integer,integer,integer,integer,integer) to authenticated;
grant execute on function public.so_pickup_place(text,date,time,jsonb,text,uuid,boolean) to authenticated;
grant execute on function public.so_pickup_update(text,uuid,text,text) to authenticated;
grant execute on function public.so_pickup_cancel(text,uuid) to authenticated;
