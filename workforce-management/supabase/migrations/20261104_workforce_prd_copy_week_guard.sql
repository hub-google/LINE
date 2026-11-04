
-- Workforce PRD week duplication: scoped manager action, safe draft copies.
create or replace function public.wm_copy_week(p_tenant uuid,p_week_start timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_count int;v_start timestamptz;
begin
 if auth.uid() is null or not wm_private.can_manage(p_tenant) then
  raise exception '沒有複製班表權限' using errcode='42501';end if;
 if p_week_start is null or p_week_start<now()-interval '60 days' or p_week_start>now()+interval '300 days' then
  raise exception '日期超出可複製範圍';end if;
 if extract(isodow from p_week_start at time zone 'Asia/Taipei')<>1 or
    (p_week_start at time zone 'Asia/Taipei')::time<>'00:00:00'::time then
    raise exception '請選擇台灣時間星期一的 00:00';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_tenant::text,33));
 insert into public.wm_shifts(tenant_id,member_id,branch_id,starts_at,ends_at,status,notes,created_by)
 select s.tenant_id,s.member_id,s.branch_id,
  s.starts_at+interval '7 days',s.ends_at+interval '7 days','draft',
  left('複製班表: '||s.notes,120),auth.uid()
 from public.wm_shifts s
 where s.tenant_id=p_tenant and s.status<>'cancelled'
  and s.starts_at>=p_week_start and s.starts_at<p_week_start+interval '7 days'
  and exists(select 1 from public.wm_members m where m.tenant_id=p_tenant and m.id=s.member_id and m.status='active')
  and not exists(select 1 from public.wm_shifts d
   where d.tenant_id=p_tenant and d.member_id=s.member_id and d.status<>'cancelled'
   and tstzrange(d.starts_at,d.ends_at,'[)')&&
       tstzrange(s.starts_at+interval '7 days',s.ends_at+interval '7 days','[)'));
 get diagnostics v_count=row_count;
 insert into public.wm_audit(tenant_id,actor_id,action,target_type,details)
 values(p_tenant,auth.uid(),'week_copied_as_draft','shift',
 jsonb_build_object('from',p_week_start,'created',v_count));
 return jsonb_build_object('created',v_count,'as_draft',true);
end $fn$;
revoke all on function public.wm_copy_week(uuid,timestamptz) from public,anon;
grant execute on function public.wm_copy_week(uuid,timestamptz) to authenticated;
-- Internal period aggregation is only callable by vetted public security-definer RPCs.
revoke all on function wm_private.month_report_core(uuid,int,int) from public,anon,authenticated;
-- Disallow mixing a member with a department belonging to another branch.
create or replace function wm_private.check_member_department()
returns trigger language plpgsql security definer set search_path='' as $fn$
begin
 if new.department_id is not null and not exists(select 1 from public.wm_departments d
  where d.id=new.department_id and d.tenant_id=new.tenant_id and d.branch_id=new.branch_id)
 then raise exception '員工的部門與分店必須一致';end if;
 return new;
end $fn$;
drop trigger if exists wm_member_department_guard on public.wm_members;
create trigger wm_member_department_guard before insert or update of department_id,branch_id
 on public.wm_members for each row execute function wm_private.check_member_department();
notify pgrst,'reload schema';
