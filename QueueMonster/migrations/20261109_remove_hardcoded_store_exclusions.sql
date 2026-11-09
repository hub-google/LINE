-- Queue Monster production migration, 2026-11-09
-- Public listing is governed by tenant status, directory_enabled and onboarding_complete.
-- Never exclude stores by demo name or slug prefix. Existing test-tenant authentication and role checks are unaffected.
-- This migration was applied to the live Supabase database on 2026-11-09.

CREATE OR REPLACE FUNCTION public.so_public_directory(p_query text DEFAULT NULL::text, p_mode text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'slug',q.slug,'name',q.name,'description',q.description,
      'address',q.address,'logo_url',q.logo_url,'category',q.directory_category,
      'modules',q.modules,'oa_mode',q.oa_mode
    ) order by q.name), '[]'::jsonb)
  from (
    select t.slug,t.name,t.description,t.address,t.logo_url,t.modules,t.oa_mode,t.directory_category
    from public.so_tenants t
    where t.status='ACTIVE' and t.directory_enabled = true and t.onboarding_complete = true
      and (
        nullif(trim(p_query),'') is null
        or t.name ilike '%'||left(trim(p_query),80)||'%'
        or coalesce(t.address,'') ilike '%'||left(trim(p_query),80)||'%'
      )
      and (
        p_mode is null or p_mode='all'
        or (p_mode='queue' and coalesce((t.modules->>'queue')::boolean,false))
        or (p_mode='reserve' and coalesce((t.modules->>'reservation')::boolean,false))
      )
    order by t.name
    limit 100
  ) q;
$function$
;


CREATE OR REPLACE FUNCTION public.so_public_popular_stores(p_mode text DEFAULT 'all'::text, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
with eligible as (
 select t.slug,t.name,t.description,t.address,t.logo_url,t.modules,t.oa_mode,t.directory_category,
        coalesce(a.booking_count,0)::bigint booking_count,
        coalesce(a.ticket_count,0)::bigint ticket_count,
        coalesce(a.activity_count,0)::bigint activity_count
 from public.so_tenants t
 left join private.so_store_popularity_30d a on a.tenant_id=t.id
 where t.status='ACTIVE' and t.directory_enabled=true and t.onboarding_complete=true
  and (coalesce(p_mode,'all') <> 'queue' or coalesce((t.modules->>'queue')::boolean,false))
), ranked as (
 select *,row_number() over(order by activity_count desc,booking_count desc,ticket_count desc,name asc,slug asc)::integer popularity_rank
 from eligible
), page as (
 select * from ranked order by popularity_rank limit least(greatest(coalesce(p_limit,50),1),50)
)
select coalesce(jsonb_agg(jsonb_build_object(
 'slug',slug,'name',name,'description',description,'address',address,'logo_url',logo_url,
 'category',directory_category,'modules',modules,'oa_mode',oa_mode,
 'booking_count',booking_count,'ticket_count',ticket_count,'activity_count',activity_count,
 'popularity_rank',popularity_rank) order by popularity_rank),'[]'::jsonb)
from page;
$function$
;


CREATE OR REPLACE FUNCTION public.so_public_store_search(p_query text DEFAULT NULL::text, p_mode text DEFAULT 'all'::text, p_category text DEFAULT NULL::text, p_area text DEFAULT NULL::text, p_service text DEFAULT NULL::text, p_sort text DEFAULT 'popular'::text, p_page integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
with visible as (
 select t.slug,t.name,t.description,t.address,t.logo_url,t.modules,t.oa_mode,t.directory_category,
        coalesce(a.activity_count,0)::bigint popularity_score
 from public.so_tenants t
 left join private.so_store_popularity_30d a on a.tenant_id=t.id
 where t.status='ACTIVE' and t.directory_enabled=true and t.onboarding_complete=true
   and (coalesce(p_mode,'all') <> 'queue' or coalesce((t.modules->>'queue')::boolean,false))
), filtered as (
 select * from visible v
 where (nullif(btrim(coalesce(p_query,'')),'') is null
        or v.name ilike '%'||left(btrim(p_query),80)||'%'
        or coalesce(v.address,'') ilike '%'||left(btrim(p_query),80)||'%')
   and (coalesce(p_category,'全部')='全部' or coalesce(v.directory_category,'其他')=p_category)
   and (coalesce(p_area,'全部')='全部'
     or (p_area='線上商圈' and coalesce(v.address,'') !~ '(基隆市|台北市|臺北市|新北市|桃園市|新竹市|新竹縣|苗栗縣|台中市|臺中市|彰化縣|南投縣|雲林縣|嘉義市|嘉義縣|台南市|臺南市|高雄市|屏東縣|宜蘭縣|花蓮縣|台東縣|臺東縣|澎湖縣|金門縣|連江縣)')
     or (p_area<>'線上商圈' and position(replace(p_area,'臺','台') in replace(coalesce(v.address,''),'臺','台'))>0))
   and (coalesce(p_service,'全部')='全部'
     or (p_service='預約' and coalesce((v.modules->>'reservation')::boolean,false))
     or (p_service='取號' and coalesce((v.modules->>'queue')::boolean,false))
     or (p_service='看板' and coalesce((v.modules->>'queue')::boolean,false)
         and coalesce((v.modules->>'calling')::boolean,false)))
), numbered as (
 select *,row_number() over(
   order by case when coalesce(p_sort,'popular')='popular' then popularity_score end desc nulls last,
            case when p_sort='category' then coalesce(directory_category,'其他') end asc nulls last,
            name asc,slug asc
 ) rn from filtered
), page as (
 select * from numbered order by rn limit 50 offset (least(greatest(coalesce(p_page,1),1),100000)-1)*50
)
select jsonb_build_object(
 'total',(select count(*) from filtered),
 'page',least(greatest(coalesce(p_page,1),1),100000),
 'page_size',50,
 'items',coalesce((select jsonb_agg(jsonb_build_object(
   'slug',slug,'name',name,'description',description,'address',address,'logo_url',logo_url,
   'category',directory_category,'modules',modules,'oa_mode',oa_mode) order by rn) from page),'[]'::jsonb));
$function$
;
