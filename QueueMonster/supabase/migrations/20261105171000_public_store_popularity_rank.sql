-- Popular-store rankings: tenant-scoped daily counters, 30-day rolling display.
-- All writes come from existing reservation / ticket records; no browser can alter scores.
create table if not exists private.so_store_activity_daily (
  tenant_id uuid not null references public.so_tenants(id) on delete cascade,
  activity_date date not null,
  reservation_count bigint not null default 0 check (reservation_count >= 0),
  ticket_count bigint not null default 0 check (ticket_count >= 0),
  primary key (tenant_id,activity_date)
);
revoke all on table private.so_store_activity_daily from public,anon,authenticated;
create index if not exists so_store_activity_daily_day_idx
  on private.so_store_activity_daily(activity_date,tenant_id);

create or replace function private.so_activity_delta(
  p_tenant uuid,p_created timestamptz,p_kind text,p_delta integer
) returns void language plpgsql security definer set search_path='' as $$
begin
  if p_tenant is null or p_created is null or p_delta=0 then return; end if;
  if p_kind not in ('reservation','ticket') or p_delta not in (-1,1) then
    raise exception 'Invalid popularity counter delta' using errcode='22023';
  end if;
  insert into private.so_store_activity_daily(tenant_id,activity_date,reservation_count,ticket_count)
  values (p_tenant,(p_created at time zone 'Asia/Taipei')::date,
          case when p_kind='reservation' then p_delta else 0 end,
          case when p_kind='ticket' then p_delta else 0 end)
  on conflict (tenant_id,activity_date) do update set
    reservation_count=private.so_store_activity_daily.reservation_count+excluded.reservation_count,
    ticket_count=private.so_store_activity_daily.ticket_count+excluded.ticket_count;
end;
$$;
revoke all on function private.so_activity_delta(uuid,timestamptz,text,integer) from public,anon,authenticated;

create or replace function private.so_reservation_activity_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op in ('UPDATE','DELETE') then
    if old.deleted_at is null and old.status <> 'CANCELLED' then
      perform private.so_activity_delta(old.tenant_id,old.created_at,'reservation',-1);
    end if;
  end if;
  if tg_op in ('UPDATE','INSERT') then
    if new.deleted_at is null and new.status <> 'CANCELLED' then
      perform private.so_activity_delta(new.tenant_id,new.created_at,'reservation',1);
    end if;
  end if;
  return null;
end;
$$;
revoke all on function private.so_reservation_activity_trigger() from public,anon,authenticated;

create or replace function private.so_ticket_activity_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op in ('UPDATE','DELETE') then
    if old.deleted_at is null and old.status <> 'CANCELLED' and old.reservation_id is null then
      perform private.so_activity_delta(old.tenant_id,old.created_at,'ticket',-1);
    end if;
  end if;
  if tg_op in ('UPDATE','INSERT') then
    if new.deleted_at is null and new.status <> 'CANCELLED' and new.reservation_id is null then
      perform private.so_activity_delta(new.tenant_id,new.created_at,'ticket',1);
    end if;
  end if;
  return null;
end;
$$;
revoke all on function private.so_ticket_activity_trigger() from public,anon,authenticated;

drop trigger if exists so_reservation_activity_daily on public.so_reservations;
create trigger so_reservation_activity_daily
after insert or delete or update of status,deleted_at,tenant_id,created_at
on public.so_reservations for each row execute function private.so_reservation_activity_trigger();

drop trigger if exists so_ticket_activity_daily on public.so_tickets;
create trigger so_ticket_activity_daily
after insert or delete or update of status,deleted_at,tenant_id,created_at,reservation_id
on public.so_tickets for each row execute function private.so_ticket_activity_trigger();

-- Rebuild from actual retained records once, after the trigger is installed.
insert into private.so_store_activity_daily(tenant_id,activity_date,reservation_count,ticket_count)
select tenant_id,activity_date,sum(reservation_count),sum(ticket_count)
from (
  select r.tenant_id,(r.created_at at time zone 'Asia/Taipei')::date activity_date,
         count(*)::bigint reservation_count,0::bigint ticket_count
  from public.so_reservations r where r.deleted_at is null and r.status <> 'CANCELLED'
  group by r.tenant_id,(r.created_at at time zone 'Asia/Taipei')::date
  union all
  select k.tenant_id,(k.created_at at time zone 'Asia/Taipei')::date,
         0::bigint,count(*)::bigint
  from public.so_tickets k where k.deleted_at is null and k.status <> 'CANCELLED'
    and k.reservation_id is null
  group by k.tenant_id,(k.created_at at time zone 'Asia/Taipei')::date
) activity group by tenant_id,activity_date
on conflict (tenant_id,activity_date) do update set
 reservation_count=excluded.reservation_count,ticket_count=excluded.ticket_count;

-- Private summary. Public callers only see aggregate counts for approved directory shops.
create or replace view private.so_store_popularity_30d with (security_invoker=true) as
select t.id as tenant_id,
       coalesce(sum(a.reservation_count),0)::bigint as booking_count,
       coalesce(sum(a.ticket_count),0)::bigint as ticket_count,
       coalesce(sum(a.reservation_count+a.ticket_count),0)::bigint as activity_count
from public.so_tenants t
left join private.so_store_activity_daily a on a.tenant_id=t.id
  and a.activity_date between ((now() at time zone 'Asia/Taipei')::date-29)
                          and (now() at time zone 'Asia/Taipei')::date
group by t.id;
revoke all on private.so_store_popularity_30d from public,anon,authenticated;

create or replace function public.so_public_popular_stores(p_mode text default 'all',p_limit integer default 50)
returns jsonb language sql stable security definer set search_path='' as $$
with eligible as (
 select t.slug,t.name,t.description,t.address,t.logo_url,t.modules,t.oa_mode,t.directory_category,
        coalesce(a.booking_count,0)::bigint booking_count,
        coalesce(a.ticket_count,0)::bigint ticket_count,
        coalesce(a.activity_count,0)::bigint activity_count
 from public.so_tenants t
 left join private.so_store_popularity_30d a on a.tenant_id=t.id
 where t.status='ACTIVE' and t.directory_enabled=true
  and t.slug not like 'qa-%' and t.slug not in ('greenfield-salon','demo-clinic')
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
$$;
revoke all on function public.so_public_popular_stores(text,integer) from public;
grant execute on function public.so_public_popular_stores(text,integer) to anon,authenticated;

-- Server-side filtered search, not a search of the popularity Top 50.
create or replace function public.so_public_store_search(
 p_query text default null,p_mode text default 'all',
 p_category text default null,p_area text default null,p_service text default null,
 p_sort text default 'name',p_page integer default 1
) returns jsonb language sql stable security definer set search_path='' as $$
with visible as (
 select t.slug,t.name,t.description,t.address,t.logo_url,t.modules,t.oa_mode,t.directory_category
 from public.so_tenants t
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
   order by case when p_sort='category' then coalesce(directory_category,'其他') end asc nulls last,
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

comment on table private.so_store_activity_daily is
 'True reservation and independent ticket actions by Taipei calendar day, from trigger-maintained source records; not writable via browser.';
comment on function public.so_public_popular_stores(text,integer) is
 'Public Top 50 listed merchants by valid reservations plus independent queue tickets over the last 30 Taipei days; QA/demo excluded.';
