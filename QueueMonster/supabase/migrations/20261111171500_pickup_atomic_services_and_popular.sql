-- Atomic three-service activation and pickup-aware popular-store ranking.
CREATE OR REPLACE FUNCTION public.so_public_popular_stores(p_mode text DEFAULT 'all'::text, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
with eligible as (
 select t.slug,t.name,t.description,t.address,t.logo_url,coalesce(t.modules,'{}'::jsonb)||jsonb_build_object('pickup',coalesce(p.enabled,false)) as modules,t.oa_mode,t.directory_category,
        coalesce(a.booking_count,0)::bigint booking_count,
        coalesce(a.ticket_count,0)::bigint ticket_count,
        (select count(*) from public.so_pickup_orders o where o.tenant_id=t.id and o.created_at>=now()-interval '30 days' and o.status not in ('REJECTED','CANCELLED'))::bigint order_count,
        (coalesce(a.activity_count,0)+(select count(*) from public.so_pickup_orders o where o.tenant_id=t.id and o.created_at>=now()-interval '30 days' and o.status not in ('REJECTED','CANCELLED')))::bigint activity_count
 from public.so_tenants t
 left join private.so_store_popularity_30d a on a.tenant_id=t.id
 left join public.so_pickup_settings p on p.tenant_id=t.id
 where t.status='ACTIVE' and t.directory_enabled=true and t.onboarding_complete=true
  and (coalesce(p_mode,'all') <> 'queue' or coalesce((t.modules->>'queue')::boolean,false))
  and (coalesce(p_mode,'all') <> 'pickup' or coalesce(p.enabled,false))
), ranked as (
 select *,row_number() over(order by activity_count desc,booking_count desc,ticket_count desc,order_count desc,name asc,slug asc)::integer popularity_rank
 from eligible
), page as (
 select * from ranked order by popularity_rank limit least(greatest(coalesce(p_limit,50),1),50)
)
select coalesce(jsonb_agg(jsonb_build_object(
 'slug',slug,'name',name,'description',description,'address',address,'logo_url',logo_url,
 'category',directory_category,'modules',modules,'oa_mode',oa_mode,
 'booking_count',booking_count,'ticket_count',ticket_count,'order_count',order_count,'activity_count',activity_count,
 'popularity_rank',popularity_rank) order by popularity_rank),'[]'::jsonb)
from page;
$function$
;
create or replace function public.so_set_all_merchant_services(p_slug text,p_reservation boolean,p_queue boolean,p_pickup boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_tenant uuid;v_original jsonb;
begin
 if p_pickup is null then raise exception '請明確選擇線上點餐開關' using errcode='22023';end if;
 -- Existing operation verifies real staff/manager rights and locks the tenant.
 select public.so_set_merchant_services(p_slug,p_reservation,p_queue) into v_original;
 select id into v_tenant from public.so_tenants where slug=p_slug;
 insert into public.so_pickup_settings(tenant_id,enabled)
 values(v_tenant,p_pickup)
 on conflict (tenant_id) do update set enabled=excluded.enabled,updated_at=now();
 insert into public.so_audit(tenant_id,actor,action,info)
 values(v_tenant,auth.uid(),'merchant_pickup_enabled',jsonb_build_object('enabled',p_pickup));
 return jsonb_build_object('slug',p_slug,'modules',v_original->'modules','pickup_enabled',p_pickup);
end $$;
revoke all on function public.so_set_all_merchant_services(text,boolean,boolean,boolean) from public,anon;
grant execute on function public.so_set_all_merchant_services(text,boolean,boolean,boolean) to authenticated;
