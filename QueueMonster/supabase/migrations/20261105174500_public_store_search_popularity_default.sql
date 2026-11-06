-- Search default now mirrors the visible popularity sort, while still searching all public stores.
create or replace function public.so_public_store_search(
 p_query text default null,p_mode text default 'all',
 p_category text default null,p_area text default null,p_service text default null,
 p_sort text default 'popular',p_page integer default 1
) returns jsonb language sql stable security definer set search_path='' as $$
with visible as (
 select t.slug,t.name,t.description,t.address,t.logo_url,t.modules,t.oa_mode,t.directory_category,
        coalesce(a.activity_count,0)::bigint popularity_score
 from public.so_tenants t
 left join private.so_store_popularity_30d a on a.tenant_id=t.id
 where t.status='ACTIVE' and t.directory_enabled=true
   and t.slug not like 'qa-%' and t.slug not in ('greenfield-salon','demo-clinic')
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
$$;
revoke all on function public.so_public_store_search(text,text,text,text,text,text,integer) from public;
grant execute on function public.so_public_store_search(text,text,text,text,text,text,integer) to anon,authenticated;
