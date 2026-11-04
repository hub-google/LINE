-- Booking policy is isolated from the general tenant patch API.
create table if not exists public.so_booking_policy(
 tenant_id uuid primary key references public.so_tenants(id) on delete cascade,
 closed_weekdays smallint[] not null default '{}'::smallint[],
 closed_dates date[] not null default '{}'::date[],
 break_start time,
 break_end time,
 min_notice_minutes integer not null default 0 check (min_notice_minutes between 0 and 10080),
 updated_at timestamptz not null default now(),
 constraint so_policy_break_pair check ((break_start is null and break_end is null) or (break_start is not null and break_end is not null and break_end>break_start))
);
alter table public.so_booking_policy enable row level security;
revoke all on public.so_booking_policy from public, anon, authenticated;

create or replace function public.so_get_booking_policy(p_slug text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.so_tenants; p public.so_booking_policy;
begin
 select * into t from public.so_tenants where slug=p_slug;
 if not found then raise exception '找不到門市';end if;
 if private.so_role(t.id) is null and not private.so_platform() then raise exception '沒有查看設定權限' using errcode='42501';end if;
 select * into p from public.so_booking_policy where tenant_id=t.id;
 return jsonb_build_object('closed_weekdays',coalesce(to_jsonb(p.closed_weekdays),'[]'::jsonb),
 'closed_dates',coalesce(to_jsonb(p.closed_dates),'[]'::jsonb),
 'break_start',to_char(p.break_start,'HH24:MI'),'break_end',to_char(p.break_end,'HH24:MI'),
 'min_notice_minutes',coalesce(p.min_notice_minutes,0));
end;
$$;
revoke all on function public.so_get_booking_policy(text) from public,anon;
grant execute on function public.so_get_booking_policy(text) to authenticated;

create or replace function public.so_set_booking_policy(
 p_slug text, p_closed_weekdays smallint[], p_closed_dates date[],
 p_break_start text, p_break_end text, p_min_notice_minutes integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.so_tenants; v_break_start time;v_break_end time;
begin
 if auth.uid() is null then raise exception '請先登入'; end if;
 select * into t from public.so_tenants where slug=p_slug;
 if not found then raise exception '找不到門市';end if;
 if private.so_role(t.id) not in('OWNER','MANAGER') and not private.so_platform() then
   raise exception '僅企業管理者可修改預約規則' using errcode='42501';end if;
 if cardinality(coalesce(p_closed_weekdays,'{}'::smallint[]))>7
   or exists(select 1 from unnest(coalesce(p_closed_weekdays,'{}'::smallint[])) x where x not between 0 and 6) then
   raise exception '固定公休日必須為週日至週六';end if;
 if cardinality(coalesce(p_closed_dates,'{}'::date[]))>64 then raise exception '最多設定 64 個特殊休假日';end if;
 if p_min_notice_minutes is null or p_min_notice_minutes not between 0 and 10080 then
   raise exception '提前預約分鐘數必須介於 0 與 10080';end if;
 if nullif(p_break_start,'') is not null and p_break_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
   raise exception '休息開始時間格式錯誤';end if;
 if nullif(p_break_end,'') is not null and p_break_end !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
   raise exception '休息結束時間格式錯誤';end if;
 v_break_start:=nullif(p_break_start,'')::time;v_break_end:=nullif(p_break_end,'')::time;
 if (v_break_start is null) <> (v_break_end is null) or
   (v_break_start is not null and v_break_end<=v_break_start) then
   raise exception '休息時間需同時設定開始與結束，且結束晚於開始';end if;
 insert into public.so_booking_policy(tenant_id,closed_weekdays,closed_dates,break_start,break_end,min_notice_minutes,updated_at)
 values(t.id,coalesce(p_closed_weekdays,'{}'::smallint[]),coalesce(p_closed_dates,'{}'::date[]),v_break_start,v_break_end,p_min_notice_minutes,now())
 on conflict(tenant_id) do update set closed_weekdays=excluded.closed_weekdays,closed_dates=excluded.closed_dates,
 break_start=excluded.break_start,break_end=excluded.break_end,min_notice_minutes=excluded.min_notice_minutes,updated_at=now();
 insert into public.so_audit(tenant_id,actor,action,info)
 values(t.id,auth.uid(),'booking_policy_changed',
 jsonb_build_object('closed_weekdays',p_closed_weekdays,'closed_dates',p_closed_dates,'break_start',p_break_start,'break_end',p_break_end,'min_notice_minutes',p_min_notice_minutes));
 return public.so_get_booking_policy(p_slug);
end;
$$;
revoke all on function public.so_set_booking_policy(text,smallint[],date[],text,text,integer) from public,anon;
grant execute on function public.so_set_booking_policy(text,smallint[],date[],text,text,integer) to authenticated;

create or replace function public.so_validate_booking_policy()
returns trigger language plpgsql security definer set search_path='' as $$
declare p public.so_booking_policy;v_local timestamp;
begin
 if tg_op='UPDATE' and new.booking_date is not distinct from old.booking_date
    and new.booking_time is not distinct from old.booking_time then return new; end if;
 select * into p from public.so_booking_policy where tenant_id=new.tenant_id;
 v_local:=(now() at time zone 'Asia/Taipei');
 if extract(dow from new.booking_date)::int = any(coalesce(p.closed_weekdays,'{}'::smallint[]))
   or new.booking_date = any(coalesce(p.closed_dates,'{}'::date[])) then
   raise exception '該日店家休息，請選其他日期';end if;
 if p.break_start is not null and new.booking_time>=p.break_start and new.booking_time<p.break_end then
   raise exception '該時段店家休息，請選其他時間';end if;
 if (new.booking_date+new.booking_time)::timestamp<v_local+make_interval(mins=>coalesce(p.min_notice_minutes,0)) then
   raise exception '此時段已超過可預約時間';end if;
 return new;
end;
$$;
revoke all on function public.so_validate_booking_policy() from public,anon,authenticated;
drop trigger if exists so_booking_policy_check on public.so_reservations;
create trigger so_booking_policy_check before insert or update of booking_date,booking_time
 on public.so_reservations for each row execute function public.so_validate_booking_policy();

CREATE OR REPLACE FUNCTION public.so_public_state(p_slug text, p_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants; v_policy public.so_booking_policy; v_day date:=coalesce(p_date,(now() at time zone 'Asia/Taipei')::date); v_today date:=(now() at time zone 'Asia/Taipei')::date; v_slots jsonb;v_current text;v_waiting int;
begin
 if auth.uid() is null then raise exception '請先完成登入' using errcode='28000';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '企業網站不存在或未開放';end if;
 select * into v_policy from public.so_booking_policy where tenant_id=t.id;
 select coalesce(number_prefix,'')||ticket_no::text into v_current from public.so_tickets where tenant_id=t.id and deleted_at is null and status in('CALLED','SERVING') order by updated_at desc limit 1;
 select count(*) into v_waiting from public.so_tickets where tenant_id=t.id and deleted_at is null and status='WAITING';
 select coalesce(jsonb_agg(jsonb_build_object('time',to_char(gs,'HH24:MI'),'capacity',t.slot_capacity,'booked',
 (select coalesce(sum(party_size),0) from public.so_reservations r where r.tenant_id=t.id and r.deleted_at is null and booking_date=v_day and booking_time=gs::time and r.status in('CONFIRMED','CHECKED_IN')),
 'available',greatest(0,t.slot_capacity-(select coalesce(sum(party_size),0) from public.so_reservations r where r.tenant_id=t.id and r.deleted_at is null and booking_date=v_day and booking_time=gs::time and r.status in('CONFIRMED','CHECKED_IN')))) order by gs),'[]'::jsonb) into v_slots
 from generate_series((v_day+t.open_time)::timestamp,(v_day+t.close_time)::timestamp - make_interval(mins=>t.slot_minutes),make_interval(mins=>t.slot_minutes)) gs
 where (v_policy.break_start is null or gs::time < v_policy.break_start or gs::time >= v_policy.break_end)
   and gs >= (now() at time zone 'Asia/Taipei') + make_interval(mins=>coalesce(v_policy.min_notice_minutes,0));
 if extract(dow from v_day)::int = any(coalesce(v_policy.closed_weekdays,'{}'::smallint[]))
    or v_day = any(coalesce(v_policy.closed_dates,'{}'::date[]))
    or v_day < v_today or v_day>v_today+30 then v_slots:='[]'::jsonb; end if;
 return jsonb_build_object('tenant',jsonb_build_object('slug',t.slug,'name',t.name,'description',t.description,'phone',t.phone,'address',t.address,'accent',t.accent,'logo_url',t.logo_url,'modules',t.modules,'open_time',to_char(t.open_time,'HH24:MI'),'close_time',to_char(t.close_time,'HH24:MI'),
 'menu_booking_mode',t.menu_booking_mode,'menu_queue_mode',t.menu_queue_mode),
 'menu_items',coalesce((select jsonb_agg(jsonb_build_object(
  'id',m.id,'kind',m.kind,'name',m.name,'description',m.description,
  'price',m.price,'sort_order',m.sort_order,'active',m.active)
  order by m.sort_order,m.created_at)
 from public.so_menu_items m where m.tenant_id=t.id and m.active),'[]'::jsonb),
 'date',v_day,'today',v_today,'slots',v_slots,'current',v_current,'waiting',v_waiting,
 'my_reservations',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'number',coalesce(r.booking_prefix,'')||r.booking_no::text,'name',r.customer_name,'day',r.booking_date,'time',to_char(r.booking_time,'HH24:MI'),'party',r.party_size,'status',r.status,'created_at',r.created_at,'selected_items',r.selected_items) order by r.booking_date desc,r.booking_time desc) from public.so_reservations r where r.tenant_id=t.id and r.deleted_at is null and r.user_id in (select linked.user_id from public.so_line_links active_link join public.so_line_links linked on linked.tenant_id=active_link.tenant_id and linked.line_sub=active_link.line_sub where active_link.user_id in (select linked.user_id from public.so_line_links active_link join public.so_line_links linked on linked.tenant_id=active_link.tenant_id and linked.line_sub=active_link.line_sub where active_link.user_id=auth.uid() and active_link.tenant_id=t.id) and active_link.tenant_id=t.id) and r.booking_date >= v_today-30),'[]'::jsonb),
 'my_tickets',coalesce((select jsonb_agg(jsonb_build_object('id',k.id,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,'status',k.status,'date',k.business_date,'created_at',k.created_at,'selected_items',k.selected_items) order by k.created_at desc) from public.so_tickets k where k.tenant_id=t.id and k.deleted_at is null and k.user_id in (select linked.user_id from public.so_line_links active_link join public.so_line_links linked on linked.tenant_id=active_link.tenant_id and linked.line_sub=active_link.line_sub where active_link.user_id=auth.uid() and active_link.tenant_id=t.id) and (k.status in ('WAITING','CALLED','SERVING','PASSED') or k.business_date>=v_today-30)),'[]'::jsonb));
end$function$
;
