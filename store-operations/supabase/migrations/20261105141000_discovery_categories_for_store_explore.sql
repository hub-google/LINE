-- 2026-11-05: Public discovery category for user-selected shop listing and street exploration.
alter table public.so_tenants
  add column if not exists directory_category text not null default '其他';
do $check$ begin
 if not exists (select 1 from pg_constraint where conname='so_tenants_directory_category_format' and conrelid='public.so_tenants'::regclass) then
  alter table public.so_tenants add constraint so_tenants_directory_category_format
    check (char_length(btrim(directory_category)) between 1 and 30);
 end if;
end $check$;
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
    where t.status='ACTIVE' and t.directory_enabled = true
      and t.slug not like 'qa-%'
      and t.slug not in ('greenfield-salon','demo-clinic')
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
$function$;

CREATE OR REPLACE FUNCTION public.so_staff_state(p_slug text, p_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants; v_day date:=coalesce(p_date,(now() at time zone 'Asia/Taipei')::date);v_role text;
begin
 select * into t from public.so_tenants where slug=p_slug;
 if not found then raise exception '找不到企業';end if;
 v_role:=private.so_role(t.id);
 if v_role is null and not private.so_platform() then raise exception '沒有企業後台權限' using errcode='42501';end if;
 return jsonb_build_object('role',coalesce(v_role,'PLATFORM'),'tenant',jsonb_build_object('slug',t.slug,'name',t.name,'description',t.description,'phone',t.phone,'address',t.address,'accent',t.accent,'logo_url',t.logo_url,'directory_category',t.directory_category,'modules',t.modules,'status',t.status,'line_status',t.line_status,'oa_mode',t.oa_mode,'directory_enabled',t.directory_enabled,'open_time',to_char(t.open_time,'HH24:MI'),'close_time',to_char(t.close_time,'HH24:MI'),'slot_minutes',t.slot_minutes,'slot_capacity',t.slot_capacity,
 'menu_booking_mode',t.menu_booking_mode,'menu_queue_mode',t.menu_queue_mode,
 'queue_prefix',t.queue_prefix,'queue_last_number',t.queue_last_number,'queue_round',t.queue_round,
 'booking_prefix',t.booking_prefix,'booking_last_number',t.booking_last_number,'booking_round',t.booking_round),
 'menu_items',coalesce((select jsonb_agg(jsonb_build_object(
  'id',m.id,'kind',m.kind,'name',m.name,'description',m.description,'price',m.price,
  'sort_order',m.sort_order,'active',m.active) order by m.sort_order,m.created_at)
  from public.so_menu_items m where m.tenant_id=t.id),'[]'::jsonb),
 'date',v_day,
 'reservations',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'number',coalesce(r.booking_prefix,'')||r.booking_no::text,'name',r.customer_name,'phone',r.customer_phone,'party',r.party_size,'time',to_char(r.booking_time,'HH24:MI'),'status',r.status,'created_at',r.created_at,'selected_items',r.selected_items) order by r.booking_time,r.created_at) from public.so_reservations r where r.tenant_id=t.id and r.deleted_at is null and r.booking_date=v_day),'[]'::jsonb),
 'tickets',coalesce((select jsonb_agg(jsonb_build_object('id',k.id,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,'name',k.customer_name,'status',k.status,'source',k.source,'reservation_id',k.reservation_id,'created_at',k.created_at,'selected_items',k.selected_items,'party',k.party_size) order by k.ticket_no) from public.so_tickets k where k.tenant_id=t.id and k.deleted_at is null and k.business_date=v_day),'[]'::jsonb),
 'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'role',m.role,'email',u.email) order by m.joined_at) from public.so_members m join auth.users u on u.id=m.user_id where m.tenant_id=t.id),'[]'::jsonb),
 'invites',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'email',i.email,'role',i.role) order by i.created_at desc) from public.so_invites i where i.tenant_id=t.id and i.accepted_at is null),'[]'::jsonb));
end$function$;

CREATE OR REPLACE FUNCTION public.so_update_tenant(p_slug text, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 t public.so_tenants%rowtype; v_admin boolean; v_role text;
begin
 select * into t from public.so_tenants where slug=p_slug for update;
 if not found then raise exception '找不到企業'; end if;
 v_role:=private.so_role(t.id);
 v_admin:=private.so_platform() or (
  coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
  and t.created_by=auth.uid() and t.slug like 'qa-%' and v_role='OWNER'
 );
 if not v_admin and v_role not in ('OWNER','MANAGER') then
  raise exception '沒有設定權限' using errcode='42501';
 end if;
 if not v_admin and (p_patch ? 'modules' or p_patch ? 'status' or p_patch ? 'line_status') then
  raise exception '功能開通與停權僅平台管理員可操作' using errcode='42501';
 end if;
 if p_patch ? 'directory_category' and (char_length(btrim(coalesce(p_patch->>'directory_category',''))) not between 1 and 30 or p_patch->>'directory_category' ~ '[[:cntrl:]]') then raise exception '店家分類格式不正確';end if;
 if p_patch ? 'accent' and (p_patch->>'accent') !~ '^#[0-9a-fA-F]{6}$' then raise exception '品牌色格式錯誤';end if;
 if p_patch ? 'open_time' and (p_patch->>'open_time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception '開始時間錯誤';end if;
 if p_patch ? 'close_time' and (p_patch->>'close_time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception '結束時間錯誤';end if;
 update public.so_tenants set
 name=case when p_patch ? 'name' then left(trim(p_patch->>'name'),100) else name end,
 description=case when p_patch ? 'description' then left(p_patch->>'description',500) else description end,
 phone=case when p_patch ? 'phone' then left(p_patch->>'phone',40) else phone end,
 address=case when p_patch ? 'address' then left(p_patch->>'address',200) else address end,
 accent=case when p_patch ? 'accent' then p_patch->>'accent' else accent end,
 logo_url=case when p_patch ? 'logo_url' then left(p_patch->>'logo_url',500) else logo_url end,
 directory_category=case when p_patch ? 'directory_category' then btrim(p_patch->>'directory_category') else directory_category end,
 open_time=case when p_patch ? 'open_time' then (p_patch->>'open_time')::time else open_time end,
 close_time=case when p_patch ? 'close_time' then (p_patch->>'close_time')::time else close_time end,
 slot_capacity=case when p_patch ? 'slot_capacity' then (p_patch->>'slot_capacity')::int else slot_capacity end,
 slot_minutes=case when p_patch ? 'slot_minutes' then (p_patch->>'slot_minutes')::int else slot_minutes end,
 modules=case when v_admin and p_patch ? 'modules' then modules || (p_patch->'modules') else modules end,
 status=case when v_admin and p_patch ? 'status' then p_patch->>'status' else status end,
 line_status=case when v_admin and p_patch ? 'line_status' then p_patch->>'line_status' else line_status end,
 updated_at=now()
 where id=t.id returning * into t;
 if t.close_time<=t.open_time then raise exception '結束時間必須晚於開始時間';end if;
 insert into public.so_audit(tenant_id,actor,action,info)
 values(t.id,auth.uid(),'update_tenant',p_patch);
 return jsonb_build_object('slug',t.slug,'name',t.name);
end
$function$;
