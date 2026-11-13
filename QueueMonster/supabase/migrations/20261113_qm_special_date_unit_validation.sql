-- Fix a verified merchant RPC bug: custom special-date windows with arbitrary
-- syntactically valid unit UUIDs used to save successfully and silently produce
-- zero booking sessions. Validate same-tenant active resources as weekly templates.
-- Does not change existing customer records or previously stored exceptions.
CREATE OR REPLACE FUNCTION public.so_schedule_manage(p_slug text, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.qm_tenants;v_weekdays jsonb;v_templates jsonb;v_key text;v_windows jsonb;v_date date;v_end date;
 v_mode text;v_template text;v_note text;v_enabled boolean;
begin
 select * into t from public.qm_tenants where slug=p_slug and status='ACTIVE' for update;
 if not found then raise exception '找不到商家';end if;
 if coalesce(private.so_role(t.id),'') not in ('OWNER','MANAGER') and not coalesce(private.so_platform(),false)
 then raise exception '只有管理者可以調整營業排程' using errcode='42501';end if;
 if p_action='weekly' then
   v_weekdays:=p_data->'weekdays';v_templates:=p_data->'templates';v_enabled:=coalesce((p_data->>'enabled')::boolean,true);
   if jsonb_typeof(v_weekdays)<>'object' or jsonb_typeof(v_templates)<>'object' or
     (select count(*) from jsonb_object_keys(v_templates)) not between 1 and 15 then
     raise exception '請建立至少一種場次模板，並設定每週營業日';end if;
   for v_key in select key from jsonb_each(v_templates) loop
     if char_length(v_key) not between 1 and 40 or v_key !~ '^[a-zA-Z0-9_-]+$'
       or not private.so_schedule_windows_valid(v_templates->v_key) then
        raise exception '場次模板內容無效：%',v_key;end if;
     -- Every manually selected unit must belong to this shop.
     if exists(select 1 from jsonb_array_elements(v_templates->v_key) w
       where coalesce(w->>'unit_id','')<>'' and not exists(
         select 1 from public.qm_booking_resources u
         where u.id=(w->>'unit_id')::uuid and u.tenant_id=t.id and u.active)) then
         raise exception '場次模板中有不存在的服務窗口';end if;
   end loop;
   if exists(select 1 from public.qm_schedule_exceptions x
       where x.tenant_id=t.id and x.exception_date >= (now() at time zone 'Asia/Taipei')::date
         and x.template_key is not null and not (v_templates ? x.template_key)) then
       raise exception '特殊日期仍引用某個被刪除的模板，請先修改特殊日期';
   end if;
   for v_key in select x::text from generate_series(1,7) as g(x) loop
     if not (v_weekdays ? v_key) or coalesce(v_weekdays->>v_key,'') not in ('off')
       and not (v_templates ? (v_weekdays->>v_key)) then
       raise exception '星期 % 的場次模板不存在',v_key;end if;
   end loop;
   insert into public.qm_schedule_rules(tenant_id,enabled,weekdays,templates)
     values(t.id,v_enabled,v_weekdays,v_templates)
     on conflict(tenant_id) do update set enabled=excluded.enabled,weekdays=excluded.weekdays,
        templates=excluded.templates,updated_at=now();
   if v_enabled then update public.qm_tenants set multi_unit_enabled=true,updated_at=now() where id=t.id;end if;
 elsif p_action in ('exception_set','exception_delete') then
   v_date:=(p_data->>'start')::date;v_end:=(p_data->>'end')::date;
   if v_date is null or v_end is null or v_end<v_date or v_end-v_date>366
      or v_date<(now() at time zone 'Asia/Taipei')::date-365
      or v_end>(now() at time zone 'Asia/Taipei')::date+3650
   then raise exception '特殊日期區間無效，單次最多設定 367 天';end if;
   if p_action='exception_delete' then
     delete from public.qm_schedule_exceptions where tenant_id=t.id and exception_date between v_date and v_end;
   else
     v_mode:=p_data->>'mode';v_template:=nullif(p_data->>'template_key','');v_note:=left(btrim(coalesce(p_data->>'note','')),120);
     if v_mode not in ('CLOSED','CUSTOM') then raise exception '特殊日期模式無效';end if;
     if v_mode='CUSTOM' then
       if v_template is not null then
         if not exists(select 1 from public.qm_schedule_rules r
           where r.tenant_id=t.id and r.templates ? v_template) then raise exception '指定的場次模板不存在';end if;
         v_windows:=null;
       else
         v_windows:=p_data->'windows';
         if not private.so_schedule_windows_valid(v_windows) then raise exception '自訂營業時間無效';end if;
         -- Unlike the former version, a syntactically valid UUID is not enough:
         -- the selected service window must exist, belong to THIS tenant and be active.
         if exists (
           select 1 from jsonb_array_elements(v_windows) w
           where coalesce(w->>'unit_id','')<>''
             and not exists (
               select 1 from public.qm_booking_resources u
               where u.id=(w->>'unit_id')::uuid
                 and u.tenant_id=t.id and u.active
             )
         ) then raise exception '特殊日期包含不存在或已停用的服務窗口';end if;
       end if;
     else v_template:=null;v_windows:=null;end if;
     insert into public.qm_schedule_exceptions(tenant_id,exception_date,mode,template_key,windows,note)
       select t.id,g::date,v_mode,v_template,v_windows,v_note
       from generate_series(v_date,v_end,'1 day'::interval) g
       on conflict(tenant_id,exception_date) do update set mode=excluded.mode,
           template_key=excluded.template_key,windows=excluded.windows,note=excluded.note,updated_at=now();
   end if;
 else raise exception '未知排程操作';end if;
 insert into public.qm_audit(tenant_id,actor,action,info)
    values(t.id,auth.uid(),'schedule_'||p_action,jsonb_build_object('start',p_data->>'start','end',p_data->>'end','mode',p_data->>'mode'));
 return jsonb_build_object('ok',true);
end $function$
;
