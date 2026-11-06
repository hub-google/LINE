create or replace function public.so_staff_worklist(p_slug text, p_history_days integer default 14)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $function$
declare
 t public.so_tenants;
begin
 if auth.uid() is null then raise exception '請先登入'; end if;
 select * into t from public.so_tenants where slug=p_slug;
 if not found then raise exception '找不到門市'; end if;
 if private.so_role(t.id) is null and not private.so_platform() then
   raise exception '沒有門市操作權限' using errcode='42501';
 end if;
 if p_history_days not in (7,14,30,90) then
   raise exception '只能查詢最近 7、14、30 或 90 天的已處理紀錄';
 end if;
 return jsonb_build_object(
  'pending_reservations',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',r.id,'name',r.customer_name,'party',r.party_size,
      'day',to_char(r.booking_date,'YYYY-MM-DD'),'time',to_char(r.booking_time,'HH24:MI'),
      'status',r.status,'updated_at',r.updated_at
    ) order by r.booking_date,r.booking_time,r.created_at)
    from (
      select * from public.so_reservations
      where tenant_id=t.id and status in ('CONFIRMED','CHECKED_IN')
      order by booking_date,booking_time,created_at limit 500
    ) r
  ), '[]'::jsonb),
  'processed_reservations',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',r.id,'name',r.customer_name,'party',r.party_size,
      'day',to_char(r.booking_date,'YYYY-MM-DD'),'time',to_char(r.booking_time,'HH24:MI'),
      'status',r.status,'updated_at',r.updated_at
    ) order by r.updated_at desc,r.created_at desc)
    from (
      select * from public.so_reservations
      where tenant_id=t.id and status in ('COMPLETED','CANCELLED','NO_SHOW')
        and updated_at>=now()-make_interval(days=>p_history_days)
      order by updated_at desc,created_at desc limit 500
    ) r
  ), '[]'::jsonb),
  'active_tickets',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',k.id,'number','A'||lpad(k.ticket_no::text,3,'0'),
      'name',k.customer_name,'day',to_char(k.business_date,'YYYY-MM-DD'),
      'status',k.status,'source',k.source,'reservation_id',k.reservation_id,
      'created_at',k.created_at,'updated_at',k.updated_at
    ) order by k.business_date,k.ticket_no)
    from (
      select * from public.so_tickets
      where tenant_id=t.id and status in ('WAITING','CALLED','SERVING','PASSED')
      order by business_date,ticket_no limit 500
    ) k
  ), '[]'::jsonb),
  'processed_tickets',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',k.id,'number','A'||lpad(k.ticket_no::text,3,'0'),
      'name',k.customer_name,'day',to_char(k.business_date,'YYYY-MM-DD'),
      'status',k.status,'source',k.source,'reservation_id',k.reservation_id,
      'created_at',k.created_at,'updated_at',k.updated_at
    ) order by k.updated_at desc,k.ticket_no desc)
    from (
      select * from public.so_tickets
      where tenant_id=t.id and status in ('COMPLETED','CANCELLED')
        and updated_at>=now()-make_interval(days=>p_history_days)
      order by updated_at desc,ticket_no desc limit 500
    ) k
  ), '[]'::jsonb)
 );
end $function$;
revoke all on function public.so_staff_worklist(text,integer) from public,anon;
grant execute on function public.so_staff_worklist(text,integer) to authenticated;
