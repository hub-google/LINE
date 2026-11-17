-- Queue Monster pickup server-rated options and stock availability
CREATE OR REPLACE FUNCTION public.so_pickup_place(p_slug text, p_date date, p_time time without time zone, p_items jsonb, p_note text, p_request_id uuid, p_immediate boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.qm_tenants;s public.qm_pickup_settings; v_user uuid:=auth.uid();v_now date:=(now() at time zone 'Asia/Taipei')::date;
 v_pickup timestamptz;v_existing public.qm_pickup_orders;v_row public.qm_menu_items;
 v_e jsonb;v_id uuid;v_qty int;v_spec jsonb;v_sel jsonb;v_group jsonb;v_choice jsonb;v_catalog jsonb;v_chosen jsonb;v_gi integer;v_ci integer;v_extra numeric;v_add numeric;v_total numeric(12,2):=0;v_lines jsonb:='[]'::jsonb;v_count int:=0;
 v_used int;v_result public.qm_pickup_orders;v_note text:=btrim(coalesce(p_note,''));
begin
 if v_user is null then raise exception '請先登入' using errcode='28000';end if;
 select * into t from public.qm_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '門市未開放';end if;
 if not exists(select 1 from public.qm_line_links l where l.tenant_id=t.id and l.user_id=v_user) then
  raise exception '請先完成本店 LINE 身分綁定' using errcode='42501';end if;
 if p_request_id is null then raise exception '缺少防重複下單識別';end if;
 select * into s from public.qm_pickup_settings where tenant_id=t.id for update;
 if not found or not s.enabled then raise exception '店家尚未開放線上點餐';end if;
 select * into v_existing from public.qm_pickup_orders where tenant_id=t.id and user_id=v_user and request_id=p_request_id;
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
   select count(*) into v_used from public.qm_pickup_orders o where o.tenant_id=t.id and o.scheduled
    and o.pickup_at=v_pickup and o.status not in('CANCELLED','REJECTED');
   if s.capacity_basis<>'ITEMS' and v_used>=s.slot_capacity then raise exception '此取餐時段已額滿，請選其他時間';end if;
 end if;
 for v_e in select value from jsonb_array_elements(p_items) loop
   if jsonb_typeof(v_e)<>'object' or coalesce(v_e->>'id','') !~
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
     raise exception '餐點代碼格式錯誤';end if;
   v_id:=(v_e->>'id')::uuid;
   if coalesce(v_e->>'qty','') !~ '^[0-9]{1,2}$' then raise exception '餐點數量格式錯誤';end if;
   v_qty:=(v_e->>'qty')::integer;
   if v_qty not between 1 and 20 then raise exception '單品數量須為 1 至 20';end if;
   select * into v_row from public.qm_menu_items
    where id=v_id and tenant_id=t.id and active=true and pickup_enabled=true and pickup_sold_out=false and kind<>'SERVICE' and price is not null;
   if not found then raise exception '有餐點已停售，請重新整理菜單';end if;

   v_catalog:=coalesce(v_row.pickup_options,'[]'::jsonb);
   v_spec:=coalesce(v_e->'options','[]'::jsonb);
   if jsonb_typeof(v_spec)<>'array' or jsonb_array_length(v_spec)>30 then raise exception '商品規格格式錯誤';end if;
   v_extra:=0;v_chosen:='[]'::jsonb;
   for v_sel in select value from jsonb_array_elements(v_spec) loop
     if coalesce(jsonb_typeof(v_sel->'group'),'')<>'number'
        or coalesce(jsonb_typeof(v_sel->'choice'),'')<>'number'
     then raise exception '商品規格代碼格式錯誤';end if;
     v_gi:=(v_sel->>'group')::integer;v_ci:=(v_sel->>'choice')::integer;
     if v_gi<0 or v_ci<0 or v_gi>9 or v_ci>19 then raise exception '商品規格代碼超出範圍';end if;
     v_group:=v_catalog->v_gi;v_choice:=v_group->'choices'->v_ci;
     if v_group is null or v_choice is null then raise exception '商品規格已更新，請重新選擇';end if;
     if exists(select 1 from jsonb_array_elements(v_chosen) x where (x->>'group')::integer=v_gi and (x->>'choice')::integer=v_ci) then raise exception '請勿重複選擇規格';end if;
     if not coalesce((v_group->>'multiple')::boolean,false)
       and exists(select 1 from jsonb_array_elements(v_chosen) x where (x->>'group')::integer=v_gi)
     then raise exception '此規格只能單選';end if;
     v_add:=(v_choice->>'price')::numeric;
     if v_add is null or v_add<0 or v_add>10000 then raise exception '規格加價無效';end if;
     v_extra:=v_extra+v_add;
     v_chosen:=v_chosen||jsonb_build_array(jsonb_build_object('group',v_gi,'choice',v_ci,'group_name',v_group->>'name','choice_name',v_choice->>'name','price',v_add));
   end loop;
   if jsonb_array_length(v_catalog)>0 then
     for v_gi in 0..jsonb_array_length(v_catalog)-1 loop
       v_group:=v_catalog->v_gi;
       if coalesce((v_group->>'required')::boolean,false)
         and not exists(select 1 from jsonb_array_elements(v_chosen) x where (x->>'group')::integer=v_gi)
       then raise exception '必填商品規格未選擇：%',v_group->>'name';end if;
     end loop;
   end if;
   select coalesce(jsonb_agg(x.value order by (x.value->>'group')::integer,(x.value->>'choice')::integer),'[]'::jsonb)
     into v_chosen from jsonb_array_elements(v_chosen) x;
   v_count:=v_count+v_qty;
   if v_count>100 then raise exception '單筆訂單最多 100 份';end if;
   v_total:=v_total+(v_row.price+v_extra)*v_qty;
   v_lines:=v_lines||jsonb_build_array(jsonb_build_object('id',v_id,'name',v_row.name,'kind',v_row.kind,
     'qty',v_qty,'unit_price',v_row.price+v_extra,'base_price',v_row.price,'options',v_chosen,'amount',(v_row.price+v_extra)*v_qty));
 end loop;

 if not coalesce(p_immediate,false) and s.capacity_basis='ITEMS' then
  select coalesce(sum((line.value->>'qty')::integer),0) into v_used
  from public.qm_pickup_orders o
  cross join lateral jsonb_array_elements(o.items) line
  where o.tenant_id=t.id and o.scheduled and o.pickup_at=v_pickup
    and o.status not in ('REJECTED','CANCELLED');
  if v_used+v_count>s.slot_capacity then
   raise exception '此時段可製作的餐點份數已額滿，請選其他時間';
  end if;
 end if;
 insert into public.qm_pickup_orders(tenant_id,user_id,request_id,scheduled,pickup_at,items,total,note)
 values(t.id,v_user,p_request_id,not coalesce(p_immediate,false),v_pickup,v_lines,v_total,v_note)
 returning * into v_result;
 insert into public.qm_audit(tenant_id,actor,action,info) values(t.id,v_user,'pickup_order_created',
  jsonb_build_object('order_id',v_result.id,'scheduled',v_result.scheduled));
 return jsonb_build_object('id',v_result.id,'number','P'||lpad(v_result.order_no::text,5,'0'),'existing',false);
end $function$
;
CREATE OR REPLACE FUNCTION public.so_pickup_public(p_slug text, p_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.qm_tenants; s public.qm_pickup_settings; v_today date:=(now() at time zone 'Asia/Taipei')::date;
 v_date date:=coalesce(p_date,(now() at time zone 'Asia/Taipei')::date); v_slots jsonb:='[]'::jsonb;
 v_catalog jsonb:='[]'::jsonb; v_orders jsonb:='[]'::jsonb; v_rules jsonb;
begin
 if auth.uid() is null then raise exception '請先登入' using errcode='28000';end if;
 select * into t from public.qm_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '找不到營業中的門市';end if;
 if not exists(select 1 from public.qm_line_links l where l.tenant_id=t.id and l.user_id=auth.uid())
   and not exists(select 1 from public.qm_members m where m.tenant_id=t.id and m.user_id=auth.uid())
   and not coalesce(private.so_platform(),false)
 then raise exception '請先完成本店 LINE 身分綁定' using errcode='42501';end if;
 select * into s from public.qm_pickup_settings where tenant_id=t.id;
 if not found then
  s.tenant_id:=t.id;s.enabled:=false;s.schedule_mode:='REQUIRED';s.pickup_start:=t.open_time;s.pickup_end:=t.close_time;
  s.interval_minutes:=15;s.slot_capacity:=5;s.min_notice_minutes:=20;s.days_ahead:=3;s.prep_minutes:=20;
 end if;
 v_rules:=private.so_schedule_effective(t.id,v_date);
 if v_date>=v_today and v_date<=v_today+s.days_ahead and s.enabled and s.schedule_mode<>'DISABLED' then
  select coalesce(jsonb_agg(jsonb_build_object('time',to_char(ts,'HH24:MI'),'left',greatest(0,s.slot_capacity-
      (select coalesce(sum(case when s.capacity_basis='ITEMS' then (select coalesce(sum((line.value->>'qty')::int),0) from jsonb_array_elements(o.items) line) else 1 end),0) from public.qm_pickup_orders o where o.tenant_id=t.id and o.scheduled
       and (o.pickup_at at time zone 'Asia/Taipei')::date=v_date
       and to_char(o.pickup_at at time zone 'Asia/Taipei','HH24:MI')=to_char(ts,'HH24:MI')
       and o.status not in('REJECTED','CANCELLED')))) order by ts),'[]'::jsonb) into v_slots
  from generate_series((v_date+s.pickup_start)::timestamp,
       (v_date+s.pickup_end)::timestamp - make_interval(mins=>s.interval_minutes),
       make_interval(mins=>s.interval_minutes)) ts
  where ts at time zone 'Asia/Taipei' >= now()+make_interval(mins=>s.min_notice_minutes)
    and not (v_rules->>'closed')::boolean
    and (not (v_rules->>'managed')::boolean or exists(
      select 1 from jsonb_array_elements(v_rules->'windows') w
      where ts::time >= (w->>'start')::time
        and (ts+make_interval(mins=>s.interval_minutes))::time <= (w->>'end')::time));
 end if;
 if s.enabled then
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'kind',m.kind,'description',m.description,
   'price',m.price,'sort_order',m.sort_order,
 'pickup_options',m.pickup_options,'daily_limit',m.pickup_daily_limit,
 'daily_remaining',case when m.pickup_daily_limit is null then null
 else greatest(0,m.pickup_daily_limit-coalesce((
 select sum((l.value->>'qty')::integer) from public.qm_pickup_orders o
 cross join lateral jsonb_array_elements(o.items) l
 where o.tenant_id=t.id and o.status not in ('CANCELLED','REJECTED')
 and (o.pickup_at at time zone 'Asia/Taipei')::date=v_date
 and l.value->>'id'=m.id::text),0)) end) order by m.sort_order,m.created_at),'[]'::jsonb) into v_catalog
  from public.qm_menu_items m where m.tenant_id=t.id and m.active and m.pickup_enabled and not m.pickup_sold_out and m.kind<>'SERVICE' and m.price is not null;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'number','P'||lpad(o.order_no::text,5,'0'),
  'status',o.status,'items',o.items,'total',o.total,'note',o.note,'scheduled',o.scheduled,
  'pickup_at',to_char(o.pickup_at at time zone 'Asia/Taipei','YYYY-MM-DD HH24:MI'),'created_at',o.created_at,'customer_name',o.customer_name,'customer_phone',o.customer_phone)
  order by o.created_at desc),'[]'::jsonb) into v_orders
 from (select * from public.qm_pickup_orders
       where tenant_id=t.id and user_id=auth.uid() order by created_at desc limit 30) o;
 return jsonb_build_object('settings',jsonb_build_object('enabled',s.enabled,'schedule_mode',s.schedule_mode,
    'pickup_start',to_char(s.pickup_start,'HH24:MI'),'pickup_end',to_char(s.pickup_end,'HH24:MI'),
    'interval_minutes',s.interval_minutes,'slot_capacity',s.slot_capacity,'capacity_basis',s.capacity_basis,'min_notice_minutes',s.min_notice_minutes,
    'days_ahead',s.days_ahead,'prep_minutes',s.prep_minutes,
    'open_now',private.so_schedule_time_allowed(t.id,(now() at time zone 'Asia/Taipei')::timestamp)),
    'day',v_date,'slots',v_slots,'items',v_catalog,'orders',v_orders);
end $function$
;
