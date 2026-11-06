-- Source of truth for deployed isolated, real Supabase QA authentication.
-- Public one-click QA sessions are scoped to tenants created by their own auth.uid().
CREATE OR REPLACE FUNCTION public.so_test_login(p_view text DEFAULT 'STAFF'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  v_t public.so_tenants%rowtype;
  v_role text;
begin
  if v_user is null or not coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception '測試模式須使用獨立匿名 Supabase 測試身分' using errcode='28000';
  end if;
  if p_view not in ('PLATFORM','STAFF') then raise exception '不支援的測試視角'; end if;
  v_role := case when p_view='PLATFORM' then 'OWNER' else 'MANAGER' end;
  perform pg_advisory_xact_lock(hashtextextended('so_qa_login:'||v_user::text,0));
  select * into v_t from public.so_tenants
   where created_by=v_user and slug like 'qa-%'
   order by created_at asc limit 1 for update;
  if not found then
    if (select count(*) from public.so_tenants where slug like 'qa-%') >= 100 then
      raise exception '目前測試環境已達容量上限';
    end if;
    insert into public.so_tenants(slug,name,description,address,modules,created_by)
    values ('qa-'||replace(gen_random_uuid()::text,'-',''),
      '專屬測試門市', '真正讀寫 Supabase 的隔離測試環境，LINE 通知使用測試官方帳號。',
      '測試用途，無實體地址',
      '{"reservation":true,"queue":true,"calling":true,"line_notice":true,"ordering":false,"payments":false}'::jsonb,
      v_user) returning * into v_t;
  end if;
  insert into public.so_members(tenant_id,user_id,role)
  values (v_t.id,v_user,v_role)
  on conflict(tenant_id,user_id) do update
    set role=case when public.so_members.role='OWNER' then 'OWNER' else excluded.role end;
  return jsonb_build_object('slug',v_t.slug,'name',v_t.name,
    'role',v_role,'real_database',true,'line_push_enabled',true);
end
$function$
;

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
    'reservations',(select count(*) from public.so_reservations r where r.tenant_id=t.id),
    'tickets',(select count(*) from public.so_tickets k where k.tenant_id=t.id),
    'staff',(select count(*) from public.so_members m where m.tenant_id=t.id),
    'today_reservations',(select count(*) from public.so_reservations r
      where r.tenant_id=t.id and r.booking_date=v_today and r.status not in ('CANCELLED','NO_SHOW')),
    'today_tickets',(select count(*) from public.so_tickets k
      where k.tenant_id=t.id and k.business_date=v_today),
    'today_waiting',(select count(*) from public.so_tickets k
      where k.tenant_id=t.id and k.business_date=v_today and k.status='WAITING'),
    'today_completed',(select count(*) from public.so_tickets k
      where k.tenant_id=t.id and k.business_date=v_today and k.status='COMPLETED'),
    'current_number',(select 'A'||lpad(k.ticket_no::text,3,'0')
      from public.so_tickets k where k.tenant_id=t.id and k.business_date=v_today
      and k.status in ('CALLED','SERVING') order by k.updated_at desc limit 1)
  ) order by t.created_at desc) from public.so_tenants t
  where v_platform or (v_test and t.created_by=auth.uid() and t.slug like 'qa-%')),'[]'::jsonb);
end
$function$
;

CREATE OR REPLACE FUNCTION public.so_create_tenant(p_name text, p_slug text, p_modules jsonb DEFAULT '{}'::jsonb, p_owner_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 t public.so_tenants%rowtype;
 v_modules jsonb;
 v_platform boolean := private.so_platform();
 v_test boolean := coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
  and exists(select 1 from public.so_tenants a join public.so_members m on m.tenant_id=a.id
   where a.created_by=auth.uid() and a.slug like 'qa-%'
   and m.user_id=auth.uid() and m.role='OWNER');
begin
 if not v_platform and not v_test then
  raise exception '只有平台管理員可以開通企業' using errcode='42501';
 end if;
 if length(trim(coalesce(p_name,'')))<2 or p_slug !~ '^[a-z0-9][a-z0-9-]{2,39}$' then
  raise exception '請填寫正確企業名稱及英文代碼';
 end if;
 if v_test and not v_platform then
  if p_slug !~ '^qa-[a-z0-9-]{3,36}$' then
   raise exception '測試總公司只能建立 qa- 開頭的獨立測試企業' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('so_qa_create:'||auth.uid()::text,0));
  if (select count(*) from public.so_tenants
       where created_by=auth.uid() and slug like 'qa-%') >= 3 then
   raise exception '每個測試總公司最多可以開通三家測試企業';
  end if;
 end if;
 v_modules := '{"reservation":true,"queue":true,"calling":true,"line_notice":false,"ordering":false,"payments":false}'::jsonb
    || coalesce(p_modules,'{}'::jsonb);
 insert into public.so_tenants(name,slug,modules,created_by)
 values(trim(p_name),lower(p_slug),v_modules,auth.uid()) returning * into t;
 if v_test and not v_platform then
   insert into public.so_members(tenant_id,user_id,role) values(t.id,auth.uid(),'OWNER');
 end if;
 if length(trim(coalesce(p_owner_email,'')))>0 then
  insert into public.so_invites(tenant_id,email,role,invited_by)
  values(t.id,lower(trim(p_owner_email)),'OWNER',auth.uid());
 end if;
 insert into public.so_audit(tenant_id,actor,action)
 values(t.id,auth.uid(),'create_tenant');
 return jsonb_build_object('id',t.id,'slug',t.slug,'name',t.name);
end
$function$
;

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
$function$
;

revoke all on function public.so_test_login(text) from public,anon;
grant execute on function public.so_test_login(text) to authenticated;
