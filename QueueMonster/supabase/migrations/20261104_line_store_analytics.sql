-- Aggregated manager-only KPIs; no customer personal data exposed.
create or replace function public.so_staff_analytics(p_slug text, p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.so_tenants;v_days integer:=coalesce(p_days,30);v_start date;v_end date;v_booking jsonb;v_queue jsonb;v_daily jsonb;
begin
 if auth.uid() is null then raise exception '請先登入'; end if;
 select * into t from public.so_tenants where slug=p_slug;
 if not found then raise exception '找不到門市'; end if;
 if private.so_role(t.id) not in ('OWNER','MANAGER') and not private.so_platform() then
   raise exception '沒有查看報表權限' using errcode='42501'; end if;
 if v_days not in (7,30,90) then raise exception '報表範圍僅支援 7、30、90 天';end if;
 v_end:=(now() at time zone 'Asia/Taipei')::date;
 v_start:=v_end-(v_days-1);
 select jsonb_build_object(
   'total',count(*),
   'confirmed',count(*) filter (where status='CONFIRMED'),
   'checked_in',count(*) filter (where status='CHECKED_IN'),
   'completed',count(*) filter (where status='COMPLETED'),
   'cancelled',count(*) filter (where status='CANCELLED'),
   'no_show',count(*) filter (where status='NO_SHOW')
 ) into v_booking
 from public.so_reservations where tenant_id=t.id and deleted_at is null and booking_date between v_start and v_end;
 select jsonb_build_object(
   'total',count(*),
   'waiting',count(*) filter (where status='WAITING'),
   'called',count(*) filter (where status='CALLED'),
   'serving',count(*) filter (where status='SERVING'),
   'completed',count(*) filter (where status='COMPLETED'),
   'cancelled',count(*) filter (where status='CANCELLED'),
   'passed',count(*) filter (where status='PASSED'),
   'avg_wait_minutes',round((avg(extract(epoch from (last_called_at-created_at))/60)
     filter (where last_called_at is not null and last_called_at>=created_at))::numeric,1)
 ) into v_queue from public.so_tickets where tenant_id=t.id and deleted_at is null and business_date between v_start and v_end;
 select coalesce(jsonb_agg(jsonb_build_object('date',series.day,'reservations',
   (select count(*) from public.so_reservations r where r.tenant_id=t.id and r.deleted_at is null and r.booking_date=series.day),
   'tickets',(select count(*) from public.so_tickets k where k.tenant_id=t.id and k.deleted_at is null and k.business_date=series.day))
   order by series.day),'[]'::jsonb) into v_daily
 from generate_series(v_start,v_end,'1 day'::interval) series(day);
 return jsonb_build_object('merchant',t.name,'days',v_days,'start',v_start,'end',v_end,
   'reservations',v_booking,'queue',v_queue,'daily',v_daily);
end;
$$;
revoke all on function public.so_staff_analytics(text,integer) from public,anon;
grant execute on function public.so_staff_analytics(text,integer) to authenticated;
