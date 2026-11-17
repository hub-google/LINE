-- Work GPS perimeter: constrain client-supplied accuracy and preserve idempotent punch semantics.
-- Applied to existing shared Supabase database on 2026-11-17; no other project's tables changed.
CREATE OR REPLACE FUNCTION public.wm_clock(p_member uuid, p_kind text, p_key text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_accuracy double precision DEFAULT NULL::double precision)
 RETURNS wm_punches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_member public.wm_members%rowtype; v_branch public.wm_branches%rowtype; v_demo boolean; v_row public.wm_punches%rowtype; v_actor uuid:=auth.uid(); v_distance double precision;
begin
 if v_actor is null then raise exception '請先登入'; end if;
 if p_kind not in ('IN','OUT','BREAK_START','BREAK_END') or length(coalesce(p_key,'')) not between 8 and 120 then raise exception '打卡參數不正確'; end if;
 select * into v_member from public.wm_members where id=p_member and status='active';
 if not found then raise exception '員工不存在或已停用'; end if;
 select is_demo into v_demo from public.wm_tenants where id=v_member.tenant_id;
 if v_member.user_id is distinct from v_actor and not (v_demo and wm_private.is_owner(v_member.tenant_id)) then raise exception '僅能為本人打卡'; end if;
 select * into v_branch from public.wm_branches where id=v_member.branch_id and tenant_id=v_member.tenant_id;
 if v_branch.gps_required then
  if p_lat is null or p_lng is null or v_branch.latitude is null or v_branch.longitude is null then raise exception '此據點須授權定位後打卡'; end if;
  -- Browser accuracy is client controlled. Reject invalid/out-of-range values; never
  -- let an arbitrary accuracy number expand a company's GPS fence.
  if p_accuracy is null or p_accuracy < 0 or p_accuracy > 100
     or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180
  then raise exception '定位精確度不足，請移動至訊號較佳處重試'; end if;
  v_distance:=6371000 * 2 * asin(sqrt(least(1,power(sin(radians(p_lat-v_branch.latitude)/2),2)+cos(radians(v_branch.latitude))*cos(radians(p_lat))*power(sin(radians(p_lng-v_branch.longitude)/2),2))));
  if v_distance > v_branch.radius_m + least(p_accuracy,30) then raise exception '不在允許的打卡範圍內'; end if;
 end if;
 insert into public.wm_punches(tenant_id,member_id,kind,latitude,longitude,accuracy_m,source,actor_id,idempotency_key)
 values(v_member.tenant_id,p_member,p_kind,p_lat,p_lng,p_accuracy,case when v_demo and v_member.user_id is distinct from v_actor then 'admin_demo' else 'web' end,v_actor,p_key)
 on conflict(tenant_id,actor_id,idempotency_key) do nothing
 returning * into v_row;
 if v_row.id is null then
  select * into v_row from public.wm_punches where tenant_id=v_member.tenant_id and actor_id=v_actor and idempotency_key=p_key;
 end if;
 if v_row.member_id is distinct from p_member or v_row.kind is distinct from p_kind
 then raise exception '重複打卡識別碼與原始員工或打卡類型不一致'; end if;
 return v_row;
end $function$
;
