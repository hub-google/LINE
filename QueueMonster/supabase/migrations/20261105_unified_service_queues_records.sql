-- Read-only mapping of existing reservations and tickets to their service sessions.
-- Staff sees their tenant; customers see only records tied to the verified LINE identity.
create or replace function public.so_unit_records(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $f$
declare t public.so_tenants; v_staff boolean; v_user uuid:=auth.uid();
begin
 if v_user is null then raise exception '請先登入';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '商家不存在';end if;
 v_staff:=private.so_role(t.id) is not null or private.so_platform();
 return jsonb_build_object(
   'reservations',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,
      'unit_id',r.service_unit_id,'session_id',r.service_session_id,
      'unit',u.name,'group',u.group_label,'session',s.name,'time',to_char(s.start_time,'HH24:MI')))
    from public.so_reservations r
    left join public.so_booking_resources u on u.id=r.service_unit_id and u.tenant_id=t.id
    left join public.so_service_sessions s on s.id=r.service_session_id and s.tenant_id=t.id
    where r.tenant_id=t.id and r.service_session_id is not null
      and r.booking_date >= (now() at time zone 'Asia/Taipei')::date-90
      and (v_staff or exists(select 1 from public.so_line_links me
         join public.so_line_links lk on lk.tenant_id=me.tenant_id and lk.line_sub=me.line_sub
         where me.tenant_id=t.id and me.user_id=v_user and lk.user_id=r.user_id))),'[]'::jsonb),
   'tickets',coalesce((select jsonb_agg(jsonb_build_object('id',k.id,
      'unit_id',k.service_unit_id,'session_id',k.service_session_id,
      'unit',u.name,'group',u.group_label,'session',s.name,
      'reservation_id',k.reservation_id))
    from public.so_tickets k
    left join public.so_booking_resources u on u.id=k.service_unit_id and u.tenant_id=t.id
    left join public.so_service_sessions s on s.id=k.service_session_id and s.tenant_id=t.id
    where k.tenant_id=t.id and k.service_session_id is not null
      and k.business_date >= (now() at time zone 'Asia/Taipei')::date-90
      and (v_staff or exists(select 1 from public.so_line_links me
        join public.so_line_links lk on lk.tenant_id=me.tenant_id and lk.line_sub=me.line_sub
        where me.tenant_id=t.id and me.user_id=v_user and lk.user_id=k.user_id))),'[]'::jsonb));
end $f$;
revoke all on function public.so_unit_records(text) from public,anon;
grant execute on function public.so_unit_records(text) to authenticated;