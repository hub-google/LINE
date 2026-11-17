-- Allow merchant-defined exceptional dates independently of recurring weekly activation.
-- This forward-only migration preserves permissions, legacy schedules, existing reservations,
-- and the existing security-definer search_path settings.
CREATE OR REPLACE FUNCTION private.so_schedule_effective(p_tenant uuid, p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.qm_schedule_rules; x public.qm_schedule_exceptions; v_key text;v_windows jsonb;
begin
 select * into r from public.qm_schedule_rules where tenant_id=p_tenant;
 if (found and r.enabled) or exists (
   select 1 from public.qm_schedule_exceptions ex
   where ex.tenant_id=p_tenant and ex.exception_date=p_date
 ) then
   select * into x from public.qm_schedule_exceptions
    where tenant_id=p_tenant and exception_date=p_date;
   if found then
     if x.mode='CLOSED' then return jsonb_build_object('managed',true,'closed',true,'windows','[]'::jsonb,'source','exception');end if;
     if x.template_key is not null then v_windows:=r.templates->x.template_key;
     else v_windows:=x.windows;end if;
     return jsonb_build_object('managed',true,'closed',false,'windows',coalesce(v_windows,'[]'::jsonb),'source','exception');
   end if;
   v_key:=coalesce(r.weekdays->>(extract(isodow from p_date)::int)::text,'off');
   if v_key='off' or not (r.templates ? v_key) then
     return jsonb_build_object('managed',true,'closed',true,'windows','[]'::jsonb,'source','weekly');
   end if;
   return jsonb_build_object('managed',true,'closed',false,'windows',r.templates->v_key,'source','weekly');
 end if;
 -- Legacy booking-only closures remain managed by the existing booking policy.
 -- Do not unexpectedly stop queue or pickup when the new shared schedule is disabled.
 return jsonb_build_object('managed',false,'closed',false,'windows','[]'::jsonb,'source','legacy');
end $function$
;

CREATE OR REPLACE FUNCTION public.so_unit_config(p_slug text, p_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.qm_tenants; v_date date:=coalesce(p_date,(now() at time zone 'Asia/Taipei')::date);
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 select * into t from public.qm_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '商家不存在';end if;
 perform private.so_schedule_ensure_sessions(t.id,v_date);
 return jsonb_build_object('multi',t.multi_unit_enabled,'picker',t.unit_selection_enabled,
 'grouped',t.grouped_units_enabled,'linked',t.checkin_queue_enabled,
 'units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'group',u.group_label,
   'capacity',u.unit_capacity,'active',u.active,'kind',u.kind,'sort_order',u.sort_order,
   'is_default',u.is_default_session_unit) order by u.is_default_session_unit desc,u.sort_order,u.name)
   from public.qm_booking_resources u where u.tenant_id=t.id and
   (u.active or private.so_role(t.id) is not null or private.so_platform())),'[]'::jsonb),
 'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'unit_id',s.unit_id,
    'name',s.name,'date',s.session_date,'start',to_char(s.start_time,'HH24:MI'),
    'end',to_char(s.end_time,'HH24:MI'),'capacity',s.capacity,'active',(s.active and (not s.schedule_generated or coalesce((select enabled from public.qm_schedule_rules where tenant_id=t.id),false)
       or exists(select 1 from public.qm_schedule_exceptions ex where ex.tenant_id=t.id and ex.exception_date=s.session_date)) and private.so_schedule_session_unit_allowed(t.id,s.session_date,s.unit_id,s.start_time,s.end_time)),
    'booked',(select coalesce(sum(party_size),0) from public.qm_reservations r
      where r.service_session_id=s.id and r.deleted_at is null and r.status in('CONFIRMED','CHECKED_IN')))
    order by s.start_time,s.name)
    from public.qm_service_sessions s where s.tenant_id=t.id and s.session_date=v_date
      and s.deleted_at is null and
      ((s.active and (not s.schedule_generated or coalesce((select enabled from public.qm_schedule_rules where tenant_id=t.id),false)
       or exists(select 1 from public.qm_schedule_exceptions ex where ex.tenant_id=t.id and ex.exception_date=s.session_date)) and private.so_schedule_session_unit_allowed(t.id,s.session_date,s.unit_id,s.start_time,s.end_time)) or private.so_role(t.id) is not null or private.so_platform())),'[]'::jsonb));
end $function$
;
