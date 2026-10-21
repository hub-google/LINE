-- LINE store-operations: free Supabase PostgreSQL backend (test environment).
-- Run once in Supabase SQL Editor. All writes go through SECURITY DEFINER RPCs.
-- No passwords, service_role/secret keys, phone numbers or payment credentials in public pages.
create extension if not exists pgcrypto;

create table if not exists public.so_demo_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
create table if not exists public.so_demo_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  display_name text not null check (char_length(display_name) between 1 and 32),
  booking_day date not null,
  booking_time time not null,
  party_size smallint not null check(party_size between 1 and 3),
  status text not null default 'CONFIRMED' check(status in ('CONFIRMED','CHECKED_IN','CANCELLED')),
  created_at timestamptz not null default now()
);
create table if not exists public.so_demo_tickets (
  ticket_no bigint generated always as identity primary key,
  queue_day date not null,
  user_id uuid not null references auth.users(id),
  display_name text not null check (char_length(display_name) between 1 and 32),
  reservation_id uuid unique references public.so_demo_reservations(id),
  source text not null check(source in ('WALKIN','RESERVATION')),
  status text not null default 'WAITING' check(status in ('WAITING','CALLED','SERVING','PASSED','COMPLETED','CANCELLED')),
  sort_key numeric(22,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists so_demo_single_live_ticket_per_day
  on public.so_demo_tickets(user_id, queue_day)
  where status in ('WAITING','CALLED','SERVING');

create index if not exists so_demo_ticket_queue_idx
  on public.so_demo_tickets(queue_day,status,sort_key);
create index if not exists so_demo_reservation_slot_idx
  on public.so_demo_reservations(booking_day,booking_time,status);

alter table public.so_demo_staff enable row level security;
alter table public.so_demo_reservations enable row level security;
alter table public.so_demo_tickets enable row level security;
revoke all on public.so_demo_staff,public.so_demo_reservations,public.so_demo_tickets from public,anon,authenticated;
revoke all on sequence public.so_demo_tickets_ticket_no_seq from public,anon,authenticated;

create or replace function public.so_demo_is_staff()
returns boolean language sql security definer set search_path = ''
as $$ select auth.uid() is not null and exists(select 1 from public.so_demo_staff where user_id=auth.uid()); $$;

create or replace function public.so_demo_today()
returns date language sql stable set search_path=''
as $$ select (now() at time zone 'Asia/Taipei')::date; $$;

create or replace function public.so_demo_state(p_date date default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  d date := coalesce(p_date,public.so_demo_today());
  staff boolean;
  tickets jsonb;
  bookings jsonb;
  slots jsonb;
  mine bigint;
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  if d < public.so_demo_today() or d > public.so_demo_today()+30 then
    raise exception '只能查看今日起 30 天內的預約';
  end if;
  staff:=public.so_demo_is_staff();
  select coalesce(jsonb_agg(jsonb_build_object(
    'ticket_no',t.ticket_no,'display_number','A'||lpad(t.ticket_no::text,greatest(length(t.ticket_no::text),3),'0'),
    'name',case when staff or t.user_id=auth.uid() then t.display_name else '候位顧客' end,
    'mine',(t.user_id=auth.uid()),'source',t.source,'status',t.status,
    'reservation_id',case when staff or t.user_id=auth.uid() then t.reservation_id else null end
  ) order by t.sort_key,t.ticket_no),'[]'::jsonb)
  into tickets from public.so_demo_tickets t where t.queue_day=public.so_demo_today();

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'name',r.display_name,'day',r.booking_day,
    'time',to_char(r.booking_time,'HH24:MI'),'party',r.party_size,'status',r.status,
    'mine',(r.user_id=auth.uid()),
    'ticket_no',(select t.ticket_no from public.so_demo_tickets t where t.reservation_id=r.id)
  ) order by r.booking_day,r.booking_time,r.created_at),'[]'::jsonb)
  into bookings from public.so_demo_reservations r
  where (staff or r.user_id=auth.uid()) and r.booking_day>=public.so_demo_today()-1;

  select coalesce(jsonb_agg(jsonb_build_object(
      'time',to_char(s.t,'HH24:MI'),
      'available',greatest(0,3-coalesce((
        select sum(r.party_size)::int from public.so_demo_reservations r
        where r.booking_day=d and r.booking_time=s.t and r.status<>'CANCELLED'
      ),0))
    ) order by s.t),'[]'::jsonb)
  into slots from unnest(array['10:00'::time,'11:00'::time,'14:00'::time,'15:00'::time,'16:00'::time,'18:00'::time,'19:00'::time]) as s(t);
  return jsonb_build_object('today',public.so_demo_today(),'date',d,'is_staff',staff,'tickets',tickets,'reservations',bookings,'slots',slots,'my_user_id',auth.uid());
end;
$$;

create or replace function public.so_demo_book(p_name text,p_date date,p_slot time,p_party integer default 1)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  n integer;
  b public.so_demo_reservations%rowtype;
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  p_name:=btrim(coalesce(p_name,''));
  if char_length(p_name)<1 or char_length(p_name)>32 then raise exception '請輸入 1 至 32 字測試暱稱'; end if;
  if p_date is null or p_date<public.so_demo_today() or p_date>public.so_demo_today()+30 then raise exception '日期必須在今日起 30 天內'; end if;
  if p_party not between 1 and 3 then raise exception '預約人數限制 1 至 3 位'; end if;
  if p_slot is null or p_slot not in ('10:00'::time,'11:00'::time,'14:00'::time,'15:00'::time,'16:00'::time,'18:00'::time,'19:00'::time) then
     raise exception '請選擇開放的時段';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('so_reservation:'||p_date::text||':'||p_slot::text,0));
  select coalesce(sum(party_size),0) into n from public.so_demo_reservations
    where booking_day=p_date and booking_time=p_slot and status<>'CANCELLED';
  if n+p_party>3 then raise exception '此時段名額不足，請改選其他時段'; end if;
  insert into public.so_demo_reservations(user_id,display_name,booking_day,booking_time,party_size)
  values(auth.uid(),p_name,p_date,p_slot,p_party) returning * into b;
  return jsonb_build_object('id',b.id,'name',b.display_name,'day',b.booking_day,'time',to_char(b.booking_time,'HH24:MI'),'party',b.party_size,'status',b.status);
end;
$$;

create or replace function public.so_demo_take_ticket(p_name text default '現場顧客')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  t public.so_demo_tickets%rowtype;
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  p_name:=btrim(coalesce(p_name,''));
  if char_length(p_name)<1 or char_length(p_name)>32 then raise exception '請輸入 1 至 32 字暱稱'; end if;
  perform pg_advisory_xact_lock(hashtextextended('so_queue:'||public.so_demo_today()::text,0));
  select * into t from public.so_demo_tickets
    where queue_day=public.so_demo_today() and user_id=auth.uid()
      and status in ('WAITING','CALLED','SERVING') limit 1;
  if found then return jsonb_build_object('ticket_no',t.ticket_no,'display_number','A'||lpad(t.ticket_no::text,greatest(length(t.ticket_no::text),3),'0'),'existing',true); end if;
  insert into public.so_demo_tickets(queue_day,user_id,display_name,source)
    values(public.so_demo_today(),auth.uid(),p_name,'WALKIN') returning * into t;
  update public.so_demo_tickets set sort_key=t.ticket_no where ticket_no=t.ticket_no;
  return jsonb_build_object('ticket_no',t.ticket_no,'display_number','A'||lpad(t.ticket_no::text,greatest(length(t.ticket_no::text),3),'0'),'existing',false);
end;
$$;

create or replace function public.so_demo_cancel_ticket(p_ticket_no bigint)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  update public.so_demo_tickets set status='CANCELLED',updated_at=now()
  where ticket_no=p_ticket_no and user_id=auth.uid() and status='WAITING';
  if not found then raise exception '只能取消自己仍在等候的號碼牌'; end if;
end;
$$;

create or replace function public.so_demo_cancel_reservation(p_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  update public.so_demo_reservations set status='CANCELLED'
  where id=p_id and user_id=auth.uid() and status='CONFIRMED';
  if not found then raise exception '只能取消自己的未報到預約'; end if;
end;
$$;

create or replace function public.so_demo_staff_action(p_action text,p_ticket_no bigint default null,p_reservation_id uuid default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  t public.so_demo_tickets%rowtype;
  r public.so_demo_reservations%rowtype;
  new_no bigint;
  front_key numeric;
begin
  if not public.so_demo_is_staff() then raise exception '店員權限不足'; end if;
  perform pg_advisory_xact_lock(hashtextextended('so_queue:'||public.so_demo_today()::text,0));
  if p_action='checkin' then
    select * into r from public.so_demo_reservations where id=p_reservation_id for update;
    if not found or r.status<>'CONFIRMED' or r.booking_day<>public.so_demo_today() then
      raise exception '僅能報到今日且尚未報到的預約';
    end if;
    -- Prevent two live tickets for the same customer, even when checking in.
    if exists(select 1 from public.so_demo_tickets where user_id=r.user_id and queue_day=public.so_demo_today() and status in ('WAITING','CALLED','SERVING')) then
      raise exception '這位顧客已有進行中的號碼牌';
    end if;
    insert into public.so_demo_tickets(queue_day,user_id,display_name,source,reservation_id)
      values(public.so_demo_today(),r.user_id,r.display_name,'RESERVATION',r.id) returning ticket_no into new_no;
    update public.so_demo_tickets set sort_key=new_no where ticket_no=new_no;
    update public.so_demo_reservations set status='CHECKED_IN' where id=r.id;
    return jsonb_build_object('ticket_no',new_no,'display_number','A'||lpad(new_no::text,greatest(length(new_no::text),3),'0'));
  end if;
  if p_action='call' then
    if exists(select 1 from public.so_demo_tickets where queue_day=public.so_demo_today() and status in ('CALLED','SERVING')) then
      raise exception '請先完成目前服務或標記過號';
    end if;
    select * into t from public.so_demo_tickets
      where queue_day=public.so_demo_today() and status='WAITING'
      order by sort_key,ticket_no limit 1 for update;
    if not found then raise exception '目前沒有等待中的號碼'; end if;
    update public.so_demo_tickets set status='CALLED',updated_at=now() where ticket_no=t.ticket_no;
  elsif p_action='return' then
    select * into t from public.so_demo_tickets
    where ticket_no=p_ticket_no and queue_day=public.so_demo_today() and status='PASSED' for update;
    if not found then raise exception '只能將過號號碼重新排入'; end if;
    select coalesce(min(sort_key)-1,0) into front_key from public.so_demo_tickets
      where queue_day=public.so_demo_today() and status='WAITING';
    update public.so_demo_tickets set status='WAITING',sort_key=front_key,updated_at=now() where ticket_no=t.ticket_no;
  else
    select * into t from public.so_demo_tickets
      where queue_day=public.so_demo_today() and status in ('CALLED','SERVING') order by updated_at desc limit 1 for update;
    if not found then raise exception '目前無正在叫號的號碼牌'; end if;
    if p_action='recall' then
      if t.status<>'CALLED' then raise exception '服務中不可重叫'; end if;
      update public.so_demo_tickets set updated_at=now() where ticket_no=t.ticket_no;
    elsif p_action='start' then
      if t.status<>'CALLED' then raise exception '只有已叫號可開始服務'; end if;
      update public.so_demo_tickets set status='SERVING',updated_at=now() where ticket_no=t.ticket_no;
    elsif p_action='complete' then
      update public.so_demo_tickets set status='COMPLETED',updated_at=now() where ticket_no=t.ticket_no;
    elsif p_action='pass' then
      update public.so_demo_tickets set status='PASSED',updated_at=now() where ticket_no=t.ticket_no;
    else
      raise exception '未知店員操作';
    end if;
  end if;
  return jsonb_build_object('ticket_no',t.ticket_no,'display_number','A'||lpad(t.ticket_no::text,greatest(length(t.ticket_no::text),3),'0'),'action',p_action);
end;
$$;

-- All data table access is blocked; authenticated users can only call these constrained RPCs.
revoke all on function public.so_demo_is_staff(),public.so_demo_today(),
  public.so_demo_state(date),public.so_demo_book(text,date,time,integer),
  public.so_demo_take_ticket(text),public.so_demo_cancel_ticket(bigint),
  public.so_demo_cancel_reservation(uuid),public.so_demo_staff_action(text,bigint,uuid)
  from public,anon,authenticated;
grant execute on function public.so_demo_state(date),public.so_demo_book(text,date,time,integer),
  public.so_demo_take_ticket(text),public.so_demo_cancel_ticket(bigint),
  public.so_demo_cancel_reservation(uuid),public.so_demo_staff_action(text,bigint,uuid)
  to authenticated;
grant execute on function public.so_demo_is_staff(),public.so_demo_today() to authenticated;

-- After making an admin user in Supabase Authentication -> Users, add staff rights via SQL:
-- insert into public.so_demo_staff(user_id)
-- select id from auth.users where email='your-staff-email@example.com' on conflict do nothing;
