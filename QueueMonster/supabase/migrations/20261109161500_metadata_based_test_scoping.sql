-- Queue Monster: permission-safe test data classification without magic slug/name matching.
-- Existing QA/samples are classified once by actual creator identity, not identifier strings.
ALTER TABLE public.so_tenants ADD COLUMN IF NOT EXISTS is_test_tenant boolean NOT NULL DEFAULT false;
ALTER TABLE public.so_merchant_requests ADD COLUMN IF NOT EXISTS is_test_request boolean NOT NULL DEFAULT false;

UPDATE public.so_tenants t
 SET is_test_tenant = true
 WHERE t.created_by IS NULL OR EXISTS (
   SELECT 1 FROM auth.users u WHERE u.id=t.created_by AND u.is_anonymous = true
 );

UPDATE public.so_merchant_requests r
 SET is_test_request = true
 WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id=r.user_id AND u.is_anonymous = true);

-- Publish the two original system-seeded example stores, not private per-user QA stores.
-- This is a one-time initialization based on system ownership and publication readiness.
UPDATE public.so_tenants
 SET directory_enabled=true,updated_at=now()
 WHERE created_by IS NULL AND is_test_tenant AND status='ACTIVE' AND onboarding_complete;

-- so_claim_qa_recovery
CREATE OR REPLACE FUNCTION public.so_claim_qa_recovery(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_user uuid:=auth.uid();
 t public.so_tenants;
begin
 if v_user is null or not coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
   raise exception '請先使用 LINE 測試身分登入' using errcode='28000';
 end if;
 select * into t from public.so_tenants
 where slug=p_slug and status='ACTIVE' and is_test_tenant for update;
 if not found then raise exception '找不到原測試門市';end if;
 if not exists(
    select 1 from private.so_qa_recovery recover
    join public.so_line_links linked
     on linked.tenant_id=recover.tenant_id
     and linked.line_sub=recover.line_sub
    where recover.tenant_id=t.id and linked.user_id=v_user
 ) then
   raise exception '此 LINE 帳號未獲授權管理原測試門市，請使用原本測試的 LINE 帳號' using errcode='42501';
 end if;
 insert into public.so_members(tenant_id,user_id,role)
 values(t.id,v_user,'MANAGER')
 on conflict (tenant_id,user_id)
 do update set role=case when public.so_members.role='OWNER' then 'OWNER' else 'MANAGER' end;
 insert into public.so_audit(tenant_id,actor,action,info)
 values(t.id,v_user,'qa_recovery',jsonb_build_object('method','verified_line_qa_recovery'));
 return jsonb_build_object('slug',t.slug,'name',t.name,'role','MANAGER','recovered',true);
end $function$
;

-- so_create_tenant
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
   where a.created_by=auth.uid() and a.is_test_tenant
   and m.user_id=auth.uid() and m.role='OWNER');
begin
 if not v_platform and not v_test then
  raise exception '只有平台管理員可以開通企業' using errcode='42501';
 end if;
 if length(trim(coalesce(p_name,'')))<2 or p_slug !~ '^[a-z0-9][a-z0-9-]{2,39}$' then
  raise exception '請填寫正確企業名稱及英文代碼';
 end if;
 if v_test and not v_platform then
  perform pg_advisory_xact_lock(hashtextextended('so_qa_create:'||auth.uid()::text,0));
  if (select count(*) from public.so_tenants
       where created_by=auth.uid() and is_test_tenant) >= 3 then
   raise exception '每個測試總公司最多可以開通三家測試企業';
  end if;
 end if;
 v_modules := '{"reservation":true,"queue":true,"calling":true,"line_notice":false,"ordering":false,"payments":false}'::jsonb
    || coalesce(p_modules,'{}'::jsonb);
 insert into public.so_tenants(name,slug,modules,created_by,is_test_tenant,directory_enabled)
 values(trim(p_name),lower(p_slug),v_modules,auth.uid(),v_test and not v_platform,not (v_test and not v_platform)) returning * into t;
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

-- so_pending_merchant_requests
CREATE OR REPLACE FUNCTION public.so_pending_merchant_requests()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null or not private.so_platform() then
   raise exception '只有總公司管理員可以檢視申請' using errcode='42501';
 end if;
 return coalesce((
  select jsonb_agg(jsonb_build_object(
   'id',r.id,'name',r.name,'slug',r.slug,'phone',r.phone,'address',r.address,
   'requested_oa_mode',r.requested_oa_mode,'email',u.email,'created_at',r.created_at
  ) order by r.created_at)
  from public.so_merchant_requests r
  join auth.users u on u.id=r.user_id
  where r.status='PENDING' and not r.is_test_request
 ),'[]'::jsonb);
end;
$function$
;

-- so_platform_overview
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
      where t.created_by=auth.uid() and t.is_test_tenant
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
  where v_platform or (v_test and t.created_by=auth.uid() and t.is_test_tenant)),'[]'::jsonb);
end
$function$
;

-- so_review_merchant_request
CREATE OR REPLACE FUNCTION public.so_review_merchant_request(p_id uuid, p_approve boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.so_merchant_requests%rowtype;
        declare_tenant public.so_tenants%rowtype;
begin
 if auth.uid() is null or not private.so_platform() then
   raise exception '只有平台管理員可以審核' using errcode='42501';
 end if;
 select * into r from public.so_merchant_requests where id=p_id for update;
 if not found or r.status<>'PENDING' or r.is_test_request then raise exception '申請不存在或已處理'; end if;
 if p_approve then
   if exists(select 1 from public.so_tenants where slug=r.slug) then
     raise exception '店家代碼已被使用，請聯絡申請者更換';
   end if;
   insert into public.so_tenants(name,slug,phone,address,modules,created_by,oa_mode,directory_enabled)
   values(r.name,r.slug,r.phone,r.address,
     '{"reservation":true,"queue":true,"calling":true,"line_notice":true}'::jsonb,
     r.user_id,'PLATFORM',true)
   returning * into declare_tenant;
   insert into public.so_members(tenant_id,user_id,role)
   values(declare_tenant.id,r.user_id,'OWNER');
 end if;
 update public.so_merchant_requests
 set status=case when p_approve then 'APPROVED' else 'REJECTED' end,
     reviewed_at=now(),reviewed_by=auth.uid()
 where id=p_id;
 return jsonb_build_object('status',case when p_approve then 'APPROVED' else 'REJECTED' end,'slug',r.slug);
end;
$function$
;

-- so_start_merchant
CREATE OR REPLACE FUNCTION public.so_start_merchant(p_username text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid:=auth.uid();v_username text;v_t public.so_tenants%rowtype;
begin
 if v_id is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
 then raise exception '請先使用電子郵件帳號登入' using errcode='28000';end if;
 if not exists(select 1 from auth.users where id=v_id and email_confirmed_at is not null)
 then raise exception '請先驗證電子郵件';end if;
 perform pg_advisory_xact_lock(hashtextextended('so_merchant:'||v_id::text,0));
 select t.* into v_t from public.so_members m join public.so_tenants t on t.id=m.tenant_id
 where m.user_id=v_id and not t.is_test_tenant
 order by case when m.role='OWNER' then 0 else 1 end,t.created_at limit 1;
 if found then return jsonb_build_object('slug',v_t.slug,'onboarding_complete',v_t.onboarding_complete);end if;
 v_username:=lower(btrim(coalesce(p_username,'')));
 if v_username='' then
  select lower(btrim(coalesce(raw_user_meta_data->>'username',''))) into v_username from auth.users where id=v_id;
 end if;
 if v_username !~ '^[a-z][a-z0-9_-]{2,29}$'
 then raise exception '帳號需為 3 至 30 字英文字母、數字、底線或連字號';end if;
 insert into public.so_merchant_profiles(user_id,username) values(v_id,v_username)
 on conflict(user_id) do nothing;
 insert into public.so_tenants(slug,name,description,phone,address,logo_url,created_by,oa_mode,directory_enabled,onboarding_complete)
 values('shop-'||replace(gen_random_uuid()::text,'-',''),'尚未設定店名','','','','',v_id,'PLATFORM',false,false)
 returning * into v_t;
 insert into public.so_members(tenant_id,user_id,role) values(v_t.id,v_id,'OWNER');
 return jsonb_build_object('slug',v_t.slug,'onboarding_complete',false);
 exception when unique_violation then raise exception '帳號名稱已被使用，請更換';
end $function$
;

-- so_test_login
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
   where created_by=v_user and is_test_tenant
   order by created_at asc limit 1 for update;
  if not found then
    if (select count(*) from public.so_tenants where is_test_tenant) >= 100 then
      raise exception '目前測試環境已達容量上限';
    end if;
    insert into public.so_tenants(slug,name,description,address,modules,created_by,is_test_tenant,directory_enabled)
    values ('qa-'||replace(gen_random_uuid()::text,'-',''),
      '專屬測試門市', '真正讀寫 Supabase 的隔離測試環境，LINE 通知使用測試官方帳號。',
      '測試用途，無實體地址',
      '{"reservation":true,"queue":true,"calling":true,"line_notice":true,"ordering":false,"payments":false}'::jsonb,
      v_user,true,false) returning * into v_t;
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

-- so_test_pending_merchant_requests
CREATE OR REPLACE FUNCTION public.so_test_pending_merchant_requests()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
    or not exists (
      select 1 from public.so_members m
      join public.so_tenants t on t.id=m.tenant_id
      where m.user_id=auth.uid() and m.role='OWNER'
        and t.created_by=auth.uid() and t.is_test_tenant
    )
  then raise exception '請先使用一鍵登入測試總公司' using errcode='42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',r.id,'name',r.name,'slug',r.slug,'requested_oa_mode',r.requested_oa_mode,
      'created_at',r.created_at,'test_only',true
    ) order by r.created_at)
    from public.so_merchant_requests r
    where r.user_id=auth.uid() and r.status='PENDING' and r.is_test_request
  ),'[]'::jsonb);
end;
$function$
;

-- so_test_review_merchant_request
CREATE OR REPLACE FUNCTION public.so_test_review_merchant_request(p_id uuid, p_approve boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.so_merchant_requests%rowtype;
        t public.so_tenants%rowtype;
begin
  if auth.uid() is null or not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
    or not exists (
      select 1 from public.so_members m
      join public.so_tenants qa on qa.id=m.tenant_id
      where m.user_id=auth.uid() and m.role='OWNER'
        and qa.created_by=auth.uid() and qa.is_test_tenant
    )
  then raise exception '請先使用一鍵登入測試總公司' using errcode='42501'; end if;
  select * into r from public.so_merchant_requests
    where id=p_id and user_id=auth.uid() and is_test_request for update;
  if not found or r.status<>'PENDING' then raise exception '找不到你的待審核測試申請'; end if;
  if p_approve then
    if (select count(*) from public.so_tenants
        where created_by=auth.uid() and is_test_request)>=12
    then raise exception '測試門市已達容量上限'; end if;
    insert into public.so_tenants(
      name,slug,modules,created_by,oa_mode,directory_enabled,is_test_tenant
    ) values(
      r.name,r.slug,
      '{"reservation":true,"queue":true,"calling":true,"line_notice":true}'::jsonb,
      auth.uid(),'PLATFORM',false,true
    ) returning * into t;
    insert into public.so_members(tenant_id,user_id,role)
      values(t.id,auth.uid(),'OWNER');
  end if;
  update public.so_merchant_requests
     set status=case when p_approve then 'APPROVED' else 'REJECTED' end,
         reviewed_by=auth.uid(),reviewed_at=now()
    where id=r.id;
  return jsonb_build_object(
    'status',case when p_approve then 'APPROVED' else 'REJECTED' end,
    'slug',r.slug,'test_only',true
  );
end;
$function$
;

-- so_test_submit_merchant_request
CREATE OR REPLACE FUNCTION public.so_test_submit_merchant_request(p_mode text DEFAULT 'PLATFORM'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_slug text; v_id uuid;
begin
  if auth.uid() is null or not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
    or not exists (
      select 1 from public.so_members m
      join public.so_tenants t on t.id=m.tenant_id
      where m.user_id=auth.uid() and m.role='OWNER'
        and t.created_by=auth.uid() and t.is_test_tenant
    )
  then raise exception '請先使用一鍵登入測試總公司' using errcode='42501'; end if;
  if p_mode not in ('PLATFORM','OWN') then raise exception '無效的 OA 模式'; end if;
  perform pg_advisory_xact_lock(hashtextextended('so_qa_merchant:'||auth.uid()::text,0));
  if (select count(*) from public.so_merchant_requests
      where user_id=auth.uid() and status='PENDING' and is_test_request)>=5
  then raise exception '請先處理現有測試申請再新增'; end if;
  v_slug:='qa-r-'||substr(replace(gen_random_uuid()::text,'-',''),1,20);
  insert into public.so_merchant_requests(
    user_id,name,slug,requested_oa_mode,is_test_request
  ) values(auth.uid(),'測試商家 '||right(v_slug,6),v_slug,p_mode,true)
  returning id into v_id;
  return jsonb_build_object('id',v_id,'slug',v_slug,'status','PENDING','test_only',true);
end;
$function$
;

-- so_update_tenant
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
  and t.created_by=auth.uid() and t.is_test_tenant and v_role='OWNER'
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
$function$
;
