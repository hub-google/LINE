
-- Workforce HR-SCH-06: real shift exchange, employee consent, manager approval.
alter table public.wm_requests add column if not exists source_shift_id uuid;
alter table public.wm_requests add column if not exists target_shift_id uuid;
alter table public.wm_requests add column if not exists target_accepted_at timestamptz;
create table if not exists public.wm_shift_revisions (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.wm_tenants(id),
 shift_id uuid not null references public.wm_shifts(id),
 old_member_id uuid not null,
 new_member_id uuid not null,
 reason text not null,
 actor_id uuid references auth.users(id),
 changed_at timestamptz not null default clock_timestamp(),
 foreign key(tenant_id,old_member_id) references public.wm_members(tenant_id,id),
 foreign key(tenant_id,new_member_id) references public.wm_members(tenant_id,id)
);
alter table public.wm_shift_revisions enable row level security;
revoke all on public.wm_shift_revisions from anon,authenticated;
grant select on public.wm_shift_revisions to authenticated;
create policy wm_shift_revisions_read on public.wm_shift_revisions for select to authenticated
 using(wm_private.member_visible(tenant_id,old_member_id) or wm_private.member_visible(tenant_id,new_member_id));
create or replace function wm_private.enforce_swap_final_state()
returns trigger language plpgsql security definer set search_path='' as $fn$
begin
 if new.kind='swap' and new.status='approved' and old.status is distinct from new.status then
  if new.source_shift_id is null or new.target_shift_id is null or new.target_accepted_at is null
   or not exists(select 1 from public.wm_shifts s where s.id=new.source_shift_id
      and s.tenant_id=new.tenant_id and s.member_id=new.target_member_id and s.status='published')
   or not exists(select 1 from public.wm_shifts s where s.id=new.target_shift_id
      and s.tenant_id=new.tenant_id and s.member_id=new.member_id and s.status='published')
  then raise exception '換班須由雙方同意、主管審核且班表真正完成交換'; end if;
 end if;
 return new;
end $fn$;
drop trigger if exists wm_request_swap_guard on public.wm_requests;
create trigger wm_request_swap_guard before update of status on public.wm_requests
 for each row execute function wm_private.enforce_swap_final_state();

create or replace function public.wm_create_swap(p_source uuid,p_target uuid,p_reason text default '')
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare a public.wm_shifts%rowtype;b public.wm_shifts%rowtype;v_id uuid;
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 if p_source=p_target then raise exception '不能交換同一班別';end if;
 select * into a from public.wm_shifts where id=p_source and status='published';
 select * into b from public.wm_shifts where id=p_target and status='published';
 if a.id is null or b.id is null or a.tenant_id<>b.tenant_id or a.member_id=b.member_id then
  raise exception '兩個已發布班別必須屬於同企業不同員工';end if;
 if not exists(select 1 from public.wm_members m where m.tenant_id=a.tenant_id
  and m.id=a.member_id and m.user_id=auth.uid() and m.status='active') then
   raise exception '只能申請交換自己的班別' using errcode='42501';end if;
 if not exists(select 1 from public.wm_members m where m.tenant_id=a.tenant_id
  and m.id=b.member_id and m.status='active') then raise exception '對方員工不在職';end if;
 if exists(select 1 from public.wm_requests r where r.source_shift_id=p_source and r.status='pending')
 then raise exception '這個班別已經有待處理的換班申請';end if;
 insert into public.wm_requests(tenant_id,member_id,kind,starts_at,ends_at,reason,target_member_id,source_shift_id,target_shift_id)
 values(a.tenant_id,a.member_id,'swap',a.starts_at,a.ends_at,left(coalesce(p_reason,''),500),
 b.member_id,a.id,b.id) returning id into v_id;
 insert into public.wm_request_actions(tenant_id,request_id,actor_id,action)
 values(a.tenant_id,v_id,auth.uid(),'swap_submitted');
 return jsonb_build_object('request_id',v_id,'status','pending');
end $fn$;
create or replace function public.wm_consent_swap(p_request uuid,p_accepted boolean)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare r public.wm_requests%rowtype;
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 select * into r from public.wm_requests where id=p_request for update;
 if not found or r.kind<>'swap' or r.status<>'pending' then raise exception '換班申請已失效';end if;
 if not exists(select 1 from public.wm_members m where m.tenant_id=r.tenant_id and
  m.id=r.target_member_id and m.user_id=auth.uid() and m.status='active')
 then raise exception '只有被換班員工可以確認' using errcode='42501';end if;
 if p_accepted is null then raise exception '請選擇同意或拒絕';end if;
 if p_accepted then
  update public.wm_requests set target_accepted_at=clock_timestamp() where id=p_request;
 else
  update public.wm_requests set status='rejected',decision_note='對方拒絕換班',decided_at=clock_timestamp() where id=p_request;
 end if;
 insert into public.wm_request_actions(tenant_id,request_id,actor_id,action)
 values(r.tenant_id,p_request,auth.uid(),case when p_accepted then 'swap_accepted_by_target' else 'swap_declined_by_target' end);
 return jsonb_build_object('id',p_request,'accepted',p_accepted);
end $fn$;
create or replace function public.wm_review_swap(p_request uuid,p_approved boolean)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare r public.wm_requests%rowtype;a public.wm_shifts%rowtype;b public.wm_shifts%rowtype;
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 select * into r from public.wm_requests where id=p_request for update;
 if not found or r.kind<>'swap' or r.status<>'pending' or not wm_private.can_manage(r.tenant_id) then
  raise exception '沒有此換班申請的審核權限' using errcode='42501';end if;
 if p_approved is null then raise exception '缺少審核結果';end if;
 if p_approved then
  if r.target_accepted_at is null then raise exception '被交換員工尚未同意';end if;
  -- lock both shifts with a fixed order, preventing simultaneous exchange races
  perform 1 from public.wm_shifts where id in(r.source_shift_id,r.target_shift_id) order by id for update;
  select * into a from public.wm_shifts where id=r.source_shift_id;
  select * into b from public.wm_shifts where id=r.target_shift_id;
  if a.id is null or b.id is null or a.tenant_id<>r.tenant_id or b.tenant_id<>r.tenant_id
    or a.member_id<>r.member_id or b.member_id<>r.target_member_id
    or a.status<>'published' or b.status<>'published' then raise exception '班表已變更，請重新申請';end if;
  if exists(select 1 from public.wm_shifts x where x.tenant_id=r.tenant_id and x.id<>b.id
   and x.member_id=b.member_id and x.status<>'cancelled'
   and tstzrange(x.starts_at,x.ends_at,'[)')&&tstzrange(a.starts_at,a.ends_at,'[)')) or
    exists(select 1 from public.wm_shifts x where x.tenant_id=r.tenant_id and x.id<>a.id
   and x.member_id=a.member_id and x.status<>'cancelled'
   and tstzrange(x.starts_at,x.ends_at,'[)')&&tstzrange(b.starts_at,b.ends_at,'[)'))
  then raise exception '換班後與其他班表時間衝突';end if;
  update public.wm_shifts set member_id=b.member_id,updated_at=clock_timestamp() where id=a.id;
  update public.wm_shifts set member_id=a.member_id,updated_at=clock_timestamp() where id=b.id;
  insert into public.wm_shift_revisions(tenant_id,shift_id,old_member_id,new_member_id,reason,actor_id)
  values(r.tenant_id,a.id,a.member_id,b.member_id,'已核准換班',auth.uid()),
        (r.tenant_id,b.id,b.member_id,a.member_id,'已核准換班',auth.uid());
 end if;
 update public.wm_requests set status=case when p_approved then 'approved' else 'rejected' end,
   reviewer_id=auth.uid(),decided_at=clock_timestamp(),
   decision_note=case when p_approved then '雙方同意，班表已交換' else '主管未核准換班' end
   where id=p_request;
 insert into public.wm_request_actions(tenant_id,request_id,actor_id,action)
 values(r.tenant_id,p_request,auth.uid(),case when p_approved then 'swap_approved' else 'swap_rejected' end);
 return jsonb_build_object('id',p_request,'approved',p_approved);
end $fn$;
revoke all on function public.wm_create_swap(uuid,uuid,text) from public,anon;
revoke all on function public.wm_consent_swap(uuid,boolean) from public,anon;
revoke all on function public.wm_review_swap(uuid,boolean) from public,anon;
grant execute on function public.wm_create_swap(uuid,uuid,text),public.wm_consent_swap(uuid,boolean),
 public.wm_review_swap(uuid,boolean) to authenticated;
notify pgrst,'reload schema';
