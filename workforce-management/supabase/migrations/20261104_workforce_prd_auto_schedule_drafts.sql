
-- HR-SCH-07: manager-confirmed auto-schedule suggestions are inserted as drafts only.
-- No automatic publishing and no silent overriding of previously published shifts.
create or replace function public.wm_insert_draft_schedule(p_tenant uuid,p_assignments jsonb)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare r jsonb;v_member uuid;v_branch uuid;v_start timestamptz;v_end timestamptz;v_count int:=0;
begin
 if auth.uid() is null or not wm_private.can_manage(p_tenant) then
  raise exception '只有主管可建立排班草稿' using errcode='42501';end if;
 if jsonb_typeof(p_assignments)<>'array' or jsonb_array_length(p_assignments)<1 or
 jsonb_array_length(p_assignments)>60 then raise exception '單次最多 60 筆排班草稿';end if;
 for r in select value from jsonb_array_elements(p_assignments) loop
  v_member:=(r->>'member_id')::uuid;v_branch:=(r->>'branch_id')::uuid;
  v_start:=(r->>'starts_at')::timestamptz;v_end:=(r->>'ends_at')::timestamptz;
  if v_end<=v_start or v_end>v_start+interval '24 hours'
   or v_start<now()-interval '30 days' or v_start>now()+interval '300 days'
   or not exists(select 1 from public.wm_members where tenant_id=p_tenant and id=v_member and status='active')
   or not exists(select 1 from public.wm_branches where tenant_id=p_tenant and id=v_branch)
  then raise exception '自動排班含無效員工、分店或時段';end if;
  insert into public.wm_shifts(tenant_id,member_id,branch_id,starts_at,ends_at,status,notes,created_by)
  values(p_tenant,v_member,v_branch,v_start,v_end,'draft','人力需求排班建議',auth.uid());
  v_count:=v_count+1;
 end loop;
 insert into public.wm_audit(tenant_id,actor_id,action,target_type,details)
 values(p_tenant,auth.uid(),'schedule_draft_accepted','shift',jsonb_build_object('created',v_count));
 return jsonb_build_object('draft_count',v_count,'published',false);
end $fn$;
revoke all on function public.wm_insert_draft_schedule(uuid,jsonb) from public,anon;
grant execute on function public.wm_insert_draft_schedule(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
