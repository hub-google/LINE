-- Queue Monster company profile: public logo image uploads and complete admin edit data.
-- Apply to the existing Supabase project without touching other products.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('so-merchant-logos', 'so-merchant-logos', true, 2097152,
  array['image/png','image/jpeg','image/webp']::text[])
on conflict (id) do update set public=excluded.public,
 file_size_limit=excluded.file_size_limit,
 allowed_mime_types=excluded.allowed_mime_types;

-- Only a signed-in user may upload under their own auth UUID directory.
-- The logo URL is made public only when an authorized tenant update RPC saves it.
drop policy if exists so_merchant_logo_upload on storage.objects;
create policy so_merchant_logo_upload on storage.objects
for insert to authenticated
with check (
 bucket_id='so-merchant-logos'
 and (storage.foldername(name))[1] = (select auth.uid())::text
 and lower(storage.extension(name)) in ('png','jpg','jpeg','webp')
);

CREATE OR REPLACE FUNCTION public.so_platform_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_today date := (now() at time zone 'Asia/Taipei')::date;
  v_platform boolean := private.so_platform();
  v_test boolean := coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
    and exists(select 1 from public.so_tenants t join public.so_members m
      on m.tenant_id=t.id
      where t.created_by=auth.uid() and t.slug like 'qa-%'
      and m.user_id=auth.uid() and m.role='OWNER');
begin
  if not v_platform and not v_test then
    raise exception '沒有平台管理員權限' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',t.id,'slug',t.slug,'name',t.name,'status',t.status,'modules',t.modules,
    'line_status',t.line_status,'created_at',t.created_at,
    'description',t.description,'phone',t.phone,'address',t.address,
    'accent',t.accent,'logo_url',t.logo_url,'directory_category',t.directory_category,
    'open_time',t.open_time,'close_time',t.close_time,
    'slot_capacity',t.slot_capacity,'slot_minutes',t.slot_minutes,
    'onboarding_complete',t.onboarding_complete,
    'reservations',(select count(*) from public.so_reservations r where r.tenant_id=t.id and r.deleted_at is null),
    'tickets',(select count(*) from public.so_tickets k where k.tenant_id=t.id and k.deleted_at is null),
    'staff',(select count(*) from public.so_members m where m.tenant_id=t.id),
    'today_reservations',(select count(*) from public.so_reservations r
      where r.tenant_id=t.id and r.deleted_at is null and r.booking_date=v_today and r.status not in ('CANCELLED','NO_SHOW')),
    'today_tickets',(select count(*) from public.so_tickets k
      where k.tenant_id=t.id and k.deleted_at is null and k.business_date=v_today),
    'today_waiting',(select count(*) from public.so_tickets k
      where k.tenant_id=t.id and k.deleted_at is null and k.business_date=v_today and k.status='WAITING'),
    'today_completed',(select count(*) from public.so_tickets k
      where k.tenant_id=t.id and k.deleted_at is null and k.business_date=v_today and k.status='COMPLETED'),
    'current_number',(select coalesce(k.number_prefix,'')||k.ticket_no::text
      from public.so_tickets k where k.tenant_id=t.id and k.deleted_at is null and k.business_date=v_today
      and k.status in ('CALLED','SERVING') order by k.updated_at desc limit 1)
  ) order by t.created_at desc) from public.so_tenants t
  where v_platform or (v_test and t.created_by=auth.uid() and t.slug like 'qa-%')),'[]'::jsonb);
end
$function$

