-- Production-safe platform summary: each counter is derived from the real Supabase database.
-- This function remains inaccessible without an actual so_platform_admins membership.
create or replace function public.so_platform_overview()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_today date := (now() at time zone 'Asia/Taipei')::date;
begin
 if not private.so_platform() then
   raise exception '沒有平台管理員權限' using errcode='42501';
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'id',t.id,'slug',t.slug,'name',t.name,'status',t.status,'modules',t.modules,
  'line_status',t.line_status,'created_at',t.created_at,
  'reservations',(select count(*) from public.so_reservations r where r.tenant_id=t.id),
  'tickets',(select count(*) from public.so_tickets k where k.tenant_id=t.id),
  'staff',(select count(*) from public.so_members m where m.tenant_id=t.id),
  'today_reservations',(select count(*) from public.so_reservations r
    where r.tenant_id=t.id and r.booking_date=v_today and r.status not in ('CANCELLED','NO_SHOW')),
  'today_tickets',(select count(*) from public.so_tickets k where k.tenant_id=t.id and k.business_date=v_today),
  'today_waiting',(select count(*) from public.so_tickets k
    where k.tenant_id=t.id and k.business_date=v_today and k.status='WAITING'),
  'today_completed',(select count(*) from public.so_tickets k
    where k.tenant_id=t.id and k.business_date=v_today and k.status='COMPLETED'),
  'current_number',(select 'A'||lpad(k.ticket_no::text,3,'0') from public.so_tickets k
    where k.tenant_id=t.id and k.business_date=v_today and k.status in ('CALLED','SERVING')
    order by k.updated_at desc limit 1)
 ) order by t.created_at desc) from public.so_tenants t),'[]'::jsonb);
end
$$;