-- Extracted after applying the shared queue display migration on 2026-11-11.
CREATE OR REPLACE FUNCTION private.so_queue_current_number(p_tenant_id uuid, p_session_id uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT coalesce(k.number_prefix,'')||k.ticket_no::text
 FROM public.so_tickets k
 WHERE k.tenant_id=p_tenant_id AND k.deleted_at IS NULL
   AND k.status IN ('CALLED','ARRIVED','ADMITTED','SERVING')
   AND (p_session_id IS NULL OR k.service_session_id=p_session_id)
 ORDER BY k.last_called_at DESC NULLS LAST,k.updated_at DESC,k.id DESC
 LIMIT 1
$function$
;

CREATE OR REPLACE FUNCTION public.so_public_board(p_slug text, p_limit integer DEFAULT 5)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_shop public.so_tenants;
  v_current text;
  v_upcoming jsonb := '[]'::jsonb;
  v_updated_at timestamptz;
begin
  if p_slug is null or length(p_slug)>40 or p_slug !~ '^[a-z0-9][a-z0-9-]{2,39}$' then
    raise exception '門市代碼格式不正確' using errcode='22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 10 then
    raise exception '顯示筆數需介於 1 至 10' using errcode='22023';
  end if;
  select * into v_shop
    from public.so_tenants t
    where t.slug=p_slug and t.status='ACTIVE'
      and coalesce((t.modules->>'calling')::boolean,false);
  if not found then
    raise exception '找不到已開放公開叫號看板的門市' using errcode='P0002';
  end if;

  v_current:=private.so_queue_current_number(v_shop.id,null);

  select coalesce(jsonb_agg(x.display_no order by x.business_date,x.queue_joined_at,x.ticket_no,x.id),'[]'::jsonb)
    into v_upcoming
    from (
      select k.id,k.business_date,k.queue_joined_at,k.ticket_no,
             coalesce(k.number_prefix,'') || k.ticket_no::text as display_no
        from public.so_tickets k
       where k.tenant_id=v_shop.id and k.deleted_at is null and k.status='WAITING'
       order by k.business_date,k.queue_joined_at,k.ticket_no,k.id
       limit p_limit
    ) x;

  select d.updated_at into v_updated_at from public.so_queue_displays d where d.tenant_id=v_shop.id;

  -- Deliberately return only store label and queue numbers: no LINE ID, names,
  -- phone, tickets' UUIDs, booking records or private configuration.
  return jsonb_build_object(
    'shop_name',v_shop.name,
    'current',v_current,
    'upcoming',v_upcoming,
    'updated_at',v_updated_at
  );
end
$function$
;

CREATE OR REPLACE FUNCTION public.so_queue_live(p_slug text, p_ticket_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 t public.so_tenants;
 d public.so_queue_displays;
 k public.so_tickets;
 v_ahead integer;
 v_viewer uuid:=auth.uid();
begin
 if v_viewer is null then raise exception '請先登入 LINE';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '找不到門市';end if;
 select * into d from public.so_queue_displays where tenant_id=t.id;
 if p_ticket_id is not null then
   select ticket.* into k
   from public.so_tickets ticket
   where ticket.tenant_id=t.id and ticket.id=p_ticket_id
     and ticket.deleted_at is null
     and exists (
       select 1 from public.so_line_links viewer
       join public.so_line_links linked on linked.tenant_id=viewer.tenant_id
         and linked.line_sub=viewer.line_sub
       where viewer.tenant_id=t.id and viewer.user_id=v_viewer
         and linked.user_id=ticket.user_id
     );
 end if;
 if k.id is not null and k.service_session_id is not null then
   -- The public progress RPC handles both ordinary and independent service queues.
   return public.so_unit_progress(p_slug,p_ticket_id);
 end if;
 if k.id is not null and k.status='WAITING' then
   select count(*)::integer into v_ahead from public.so_tickets ahead
   where ahead.tenant_id=t.id and ahead.deleted_at is null
     and ahead.status='WAITING'
     and (ahead.queue_joined_at,ahead.id)<(k.queue_joined_at,k.id);
   v_ahead:=v_ahead+coalesce(d.serving_count,0);
 elsif k.id is not null and k.status in ('CALLED','ARRIVED','ADMITTED','SERVING') then
   v_ahead:=0;
 else
   v_ahead:=null;
 end if;
 return jsonb_build_object(
   'tenant_id',t.id,'shop_name',t.name,
   'current',d.current_number,
   'waiting',coalesce(d.waiting_count,0),
   'serving',coalesce(d.serving_count,0),
   'updated_at',d.updated_at,
   'queue_session',coalesce((select jsonb_build_object('code',session_code,'updated_at',updated_at) from public.so_queue_session_state where tenant_id=t.id),jsonb_build_object('code','MORNING')),
   'hold_policy',coalesce((select jsonb_build_object('hold_minutes',hold_minutes,'max_holds',max_holds,'return_mode',return_mode)
    from public.so_queue_hold_policy where tenant_id=t.id),
    '{"hold_minutes":20,"max_holds":2,"return_mode":"END"}'::jsonb),
   'mine',case when k.id is null then null else jsonb_build_object(
     'id',k.id,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,
     'status',k.status,'party',k.party_size,'ahead',v_ahead,
     'hold_until',k.hold_until,'hold_count',k.hold_count,
     'created_at',k.created_at
   ) end
 );
end $function$
;

CREATE OR REPLACE FUNCTION public.so_unit_progress(p_slug text, p_ticket_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants;k public.so_tickets;s public.so_service_sessions;v_current text;v_ahead int;v_waiting int;
begin
 if auth.uid() is null then raise exception '請先登入 LINE';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '商家不存在';end if;
 select * into k from public.so_tickets where tenant_id=t.id and id=p_ticket_id and deleted_at is null
   and exists(select 1 from public.so_line_links v
    join public.so_line_links owner_link on owner_link.tenant_id=v.tenant_id and owner_link.line_sub=v.line_sub
    where v.tenant_id=t.id and v.user_id=auth.uid() and owner_link.user_id=so_tickets.user_id);
 if not found then raise exception '找不到自己的候診號碼';end if;
 if k.service_session_id is null then return public.so_queue_live(p_slug,p_ticket_id);end if;
 select * into s from public.so_service_sessions where id=k.service_session_id;
 select count(*) into v_waiting from public.so_tickets where service_session_id=s.id and deleted_at is null and status='WAITING';
 v_current:=private.so_queue_current_number(t.id,s.id);
 select count(*)::int into v_ahead from public.so_tickets a where a.service_session_id=s.id and a.deleted_at is null
   and a.status='WAITING' and (a.queue_joined_at,a.ticket_no,a.id)<(k.queue_joined_at,k.ticket_no,k.id);
 if k.status in('CALLED','ARRIVED','ADMITTED','SERVING') then v_ahead:=0;end if;
 if k.status not in('WAITING','CALLED','ARRIVED','ADMITTED','SERVING') then v_ahead:=null;end if;
 return jsonb_build_object('tenant_id',t.id,'shop_name',t.name,'current',v_current,'waiting',v_waiting,
   'serving',case when v_current is null then 0 else 1 end,'updated_at',now(),
   'unit_name',(select name from public.so_booking_resources where id=s.unit_id),
   'session_name',s.name,
   'mine',jsonb_build_object('id',k.id,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,
     'status',k.status,'party',k.party_size,'ahead',v_ahead,'created_at',k.created_at));
end $function$
;

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
      'current',private.so_queue_current_number(t.id,s.id),
      'waiting',(select count(*) from public.so_tickets k where k.service_session_id=s.id and k.deleted_at is null and k.status='WAITING'),
      'next',(select coalesce(jsonb_agg(coalesce(k.number_prefix,'')||k.ticket_no::text order by k.queue_joined_at,k.ticket_no),'[]'::jsonb)
        from (select * from public.so_tickets k2 where k2.service_session_id=s.id
          and k2.deleted_at is null and k2.status='WAITING' order by k2.queue_joined_at,k2.ticket_no limit 5) k))
    order by s.start_time,u.sort_order,u.name) from public.so_service_sessions s
    join public.so_booking_resources u on u.id=s.unit_id and u.tenant_id=t.id and u.active
    where s.tenant_id=t.id and s.active and s.session_date=(now() at time zone 'Asia/Taipei')::date
      and (p_session_id is null or s.id=p_session_id)),'[]'::jsonb));
end $function$
;

REVOKE ALL ON FUNCTION private.so_queue_current_number(uuid,uuid) FROM PUBLIC;
