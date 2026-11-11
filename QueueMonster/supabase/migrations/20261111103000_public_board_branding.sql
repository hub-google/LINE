-- Display only public merchant brand fields on the anonymous read-only queue board.
-- Preserve existing SECURITY DEFINER and schema search_path behavior.
CREATE OR REPLACE FUNCTION public.so_unit_public_board(p_slug text, p_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants;
begin
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '找不到商家';end if;
 return jsonb_build_object('shop',t.name,'logo_url',t.logo_url,'accent',t.accent,'multi',t.multi_unit_enabled,
 'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,
      'unit_id',s.unit_id,'unit',u.name,'group',u.group_label,'start',to_char(s.start_time,'HH24:MI'),
      'end',to_char(s.end_time,'HH24:MI'),
      'current',(select coalesce(k.number_prefix,'')||k.ticket_no::text from public.so_tickets k
        where k.tenant_id=t.id and k.service_session_id=s.id and k.deleted_at is null
         and k.status in('CALLED','ARRIVED','ADMITTED','SERVING') order by k.updated_at desc limit 1),
      'waiting',(select count(*) from public.so_tickets k where k.service_session_id=s.id and k.deleted_at is null and k.status='WAITING'),
      'next',(select coalesce(jsonb_agg(coalesce(k.number_prefix,'')||k.ticket_no::text order by k.queue_joined_at,k.ticket_no),'[]'::jsonb)
        from (select * from public.so_tickets k2 where k2.service_session_id=s.id
          and k2.deleted_at is null and k2.status='WAITING' order by k2.queue_joined_at,k2.ticket_no limit 5) k))
    order by s.start_time,u.sort_order,u.name) from public.so_service_sessions s
    join public.so_booking_resources u on u.id=s.unit_id and u.tenant_id=t.id and u.active
    where s.tenant_id=t.id and s.active and s.session_date=(now() at time zone 'Asia/Taipei')::date
      and (p_session_id is null or s.id=p_session_id)),'[]'::jsonb));
end $function$;
