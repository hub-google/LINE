-- Shared schedules are opt-in; retain historical booking-only closures without affecting pickup.
CREATE OR REPLACE FUNCTION private.so_schedule_effective(p_tenant uuid, p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.so_schedule_rules; x public.so_schedule_exceptions; v_key text;v_windows jsonb;
begin
 select * into r from public.so_schedule_rules where tenant_id=p_tenant;
 if found and r.enabled then
   select * into x from public.so_schedule_exceptions
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
