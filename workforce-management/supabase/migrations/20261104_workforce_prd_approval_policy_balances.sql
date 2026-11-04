CREATE OR REPLACE FUNCTION public.wm_decide_request(p_request uuid, p_decision text, p_note text DEFAULT ''::text)
 RETURNS wm_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_row public.wm_requests%rowtype; v_actor uuid:=auth.uid(); v_total numeric; v_used numeric; v_need numeric; v_policy public.wm_leave_policies%rowtype; v_day date; v_balances jsonb; v_item jsonb;
begin
 if v_actor is null or p_decision not in ('approved','rejected') then raise exception '審核資料不正確'; end if;
 select * into v_row from public.wm_requests where id=p_request for update;
 if not found or not wm_private.can_manage(v_row.tenant_id) then raise exception '沒有審核權限'; end if;
 if v_row.status<>'pending' then raise exception '這筆申請已處理，不能重複審核'; end if;

 if v_row.kind='leave' and p_decision='approved' then
  select * into v_policy from public.wm_leave_policies
    where id=v_row.leave_policy_id and tenant_id=v_row.tenant_id;
  if not found then
   select * into v_policy from public.wm_leave_policies
    where tenant_id=v_row.tenant_id and leave_kind=v_row.leave_kind
    and effective_from<=(v_row.starts_at at time zone 'Asia/Taipei')::date
    order by effective_from desc limit 1;
  end if;
  if v_policy.id is not null and v_policy.balance_required then
   -- Serialize with new leave submission and entitlement modifications.
   perform 1 from public.wm_members where tenant_id=v_row.tenant_id and id=v_row.member_id for update;
   v_day:=(v_row.starts_at at time zone 'Asia/Taipei')::date;
   while (v_day::timestamp at time zone 'Asia/Taipei') < v_row.ends_at loop
    v_balances:=wm_private.leave_balance_core(v_row.tenant_id,v_row.member_id,v_day);
    select e into v_item from jsonb_array_elements(v_balances) e
     where e->>'kind'=v_row.leave_kind;
    if v_item is null then raise exception '找不到請假年度的有效額度規則';end if;
    if (v_item->>'granted_hours')::numeric+(v_item->>'carryover_hours')::numeric
     -(v_item->>'approved_hours')::numeric-(v_item->>'pending_hours')::numeric < -0.001
    then raise exception '假別可用額度不足（含待審預留時數）';end if;
    v_day:=(v_item->>'ends_before')::date;
   end loop;
  elsif v_policy.id is null then
   -- Backwards compatible for enterprises that have not configured leave policies.
   select hours into v_total from public.wm_leave_entitlements
    where tenant_id=v_row.tenant_id and member_id=v_row.member_id
    and year=extract(year from v_row.starts_at at time zone 'Asia/Taipei')::int
    and leave_kind=v_row.leave_kind for update;
   select coalesce(sum(extract(epoch from (ends_at-starts_at))/3600),0)
    into v_used from public.wm_requests
    where tenant_id=v_row.tenant_id and member_id=v_row.member_id
    and kind='leave' and leave_kind=v_row.leave_kind and status='approved'
    and extract(year from starts_at at time zone 'Asia/Taipei')=
     extract(year from v_row.starts_at at time zone 'Asia/Taipei');
   v_need:=extract(epoch from (v_row.ends_at-v_row.starts_at))/3600;
   if v_total is not null and v_used+v_need>v_total then raise exception '假別可用時數不足';end if;
  end if;
 end if;
 update public.wm_requests set status=p_decision,reviewer_id=v_actor,decided_at=clock_timestamp(),decision_note=left(coalesce(p_note,''),500) where id=p_request returning * into v_row;
 insert into public.wm_request_actions(tenant_id,request_id,actor_id,action,note) values(v_row.tenant_id,v_row.id,v_actor,p_decision,p_note);
 return v_row;
end $function$;
NOTIFY pgrst,'reload schema';