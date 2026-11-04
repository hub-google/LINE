
-- HR-ORG-02: idempotent batch CSV employee import, preserving existing records.
create or replace function public.wm_import_employees(p_tenant uuid,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare r jsonb;v_branch uuid;v_name text;v_code text;v_role text;
 v_type text;v_created int:=0;v_skipped int:=0;v_id uuid;
begin
 if auth.uid() is null or not wm_private.is_owner(p_tenant) then
  raise exception '只有企業擁有者可以匯入員工' using errcode='42501';end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)<1 or jsonb_array_length(p_rows)>200
 then raise exception '請提供 1～200 筆員工資料';end if;
 -- Entire batch is transactional. Invalid rows roll back rather than overwrite.
 for r in select value from jsonb_array_elements(p_rows) loop
  v_name:=trim(coalesce(r->>'name',''));
  v_code:=trim(coalesce(r->>'code',''));
  v_role:=coalesce(r->>'role','employee');
  v_type:=coalesce(r->>'employment_type','full_time');
  v_branch:=nullif(r->>'branch_id','')::uuid;
  if length(v_name) not between 1 and 100 or length(v_code) not between 1 and 40
    or v_role not in ('employee','manager','hr')
    or v_type not in ('full_time','part_time','hourly')
    or not exists(select 1 from public.wm_branches where id=v_branch and tenant_id=p_tenant)
  then raise exception '員工資料格式不正確（姓名、編號、分店或角色）';end if;
  v_id:=null;
  insert into public.wm_members(tenant_id,branch_id,display_name,employee_code,role,employment_type)
  values(p_tenant,v_branch,v_name,v_code,v_role,v_type)
  on conflict(tenant_id,employee_code) do nothing returning id into v_id;
  if v_id is null then v_skipped:=v_skipped+1;else v_created:=v_created+1;end if;
 end loop;
 insert into public.wm_audit(tenant_id,actor_id,action,target_type,details)
 values(p_tenant,auth.uid(),'employees_imported','member',
 jsonb_build_object('created',v_created,'skipped_existing',v_skipped));
 return jsonb_build_object('created',v_created,'skipped_existing',v_skipped);
end $fn$;
revoke all on function public.wm_import_employees(uuid,jsonb) from public,anon;
grant execute on function public.wm_import_employees(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
