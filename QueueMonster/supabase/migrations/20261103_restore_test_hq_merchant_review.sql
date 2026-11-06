-- QA-only merchant review RPCs. Existing real TEST-HQ/TEST-STAFF one-click login is unchanged.
-- Database applied in Supabase project unapiwajmgqqtdkixaab on 2026-11-03.

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
        and t.created_by=auth.uid() and t.slug like 'qa-%'
    )
  then raise exception '請先使用一鍵登入測試總公司' using errcode='42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',r.id,'name',r.name,'slug',r.slug,'requested_oa_mode',r.requested_oa_mode,
      'created_at',r.created_at,'test_only',true
    ) order by r.created_at)
    from public.so_merchant_requests r
    where r.user_id=auth.uid() and r.status='PENDING' and r.slug like 'qa-%'
  ),'[]'::jsonb);
end;
$function$;

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
        and qa.created_by=auth.uid() and qa.slug like 'qa-%'
    )
  then raise exception '請先使用一鍵登入測試總公司' using errcode='42501'; end if;
  select * into r from public.so_merchant_requests
    where id=p_id and user_id=auth.uid() and slug like 'qa-%' for update;
  if not found or r.status<>'PENDING' then raise exception '找不到你的待審核測試申請'; end if;
  if p_approve then
    if (select count(*) from public.so_tenants
        where created_by=auth.uid() and slug like 'qa-%')>=12
    then raise exception '測試門市已達容量上限'; end if;
    insert into public.so_tenants(
      name,slug,modules,created_by,oa_mode,directory_enabled
    ) values(
      r.name,r.slug,
      '{"reservation":true,"queue":true,"calling":true,"line_notice":true}'::jsonb,
      auth.uid(),'PLATFORM',false
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
$function$;

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
        and t.created_by=auth.uid() and t.slug like 'qa-%'
    )
  then raise exception '請先使用一鍵登入測試總公司' using errcode='42501'; end if;
  if p_mode not in ('PLATFORM','OWN') then raise exception '無效的 OA 模式'; end if;
  perform pg_advisory_xact_lock(hashtextextended('so_qa_merchant:'||auth.uid()::text,0));
  if (select count(*) from public.so_merchant_requests
      where user_id=auth.uid() and status='PENDING' and slug like 'qa-%')>=5
  then raise exception '請先處理現有測試申請再新增'; end if;
  v_slug:='qa-r-'||substr(replace(gen_random_uuid()::text,'-',''),1,20);
  insert into public.so_merchant_requests(
    user_id,name,slug,requested_oa_mode
  ) values(auth.uid(),'測試商家 '||right(v_slug,6),v_slug,p_mode)
  returning id into v_id;
  return jsonb_build_object('id',v_id,'slug',v_slug,'status','PENDING','test_only',true);
end;
$function$;

revoke all on function public.so_test_submit_merchant_request(text) from public;
revoke all on function public.so_test_pending_merchant_requests() from public;
revoke all on function public.so_test_review_merchant_request(uuid,boolean) from public;
grant execute on function public.so_test_submit_merchant_request(text) to authenticated;
grant execute on function public.so_test_pending_merchant_requests() to authenticated;
grant execute on function public.so_test_review_merchant_request(uuid,boolean) to authenticated;
