-- Fix SQLSTATE 42702: PL/pgSQL record variable k collided with table alias k.
-- Applied to production on 2026-11-11; retained for repeatable deployments.
-- Auth, session validation and duplicate-ticket checks are preserved.
CREATE OR REPLACE FUNCTION public.so_unit_take_number(p_slug text, p_session_id uuid, p_party integer, p_items jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants;s public.so_service_sessions;v_created_ticket public.so_tickets;
 v_seq jsonb;v_name text;v_items jsonb;v_day date:=(now() at time zone 'Asia/Taipei')::date;
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 if p_party not between 1 and 20 then raise exception '取號人數需介於 1～20';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE' for update;
 if not found or not t.multi_unit_enabled or t.modules->>'queue'<>'true' then raise exception '門市未開放此種取號';end if;
 select * into s from public.so_service_sessions where tenant_id=t.id and id=p_session_id and active;
 if not found or s.session_date<>v_day or now() at time zone 'Asia/Taipei' < (s.session_date+s.start_time)::timestamp - interval '3 hours'
   or now() at time zone 'Asia/Taipei' > (s.session_date+s.end_time)::timestamp then raise exception '此服務場次目前未開放取號';end if;
 select display_name into v_name from public.so_line_links where tenant_id=t.id and user_id=auth.uid() and display_name is not null limit 1;
 if v_name is null then raise exception '請先完成 LINE 驗證';end if;
 if exists(select 1 from public.so_tickets k where k.tenant_id=t.id and k.service_session_id=s.id
   and k.user_id in(select linked.user_id from public.so_line_links me
    join public.so_line_links linked on linked.tenant_id=me.tenant_id and linked.line_sub=me.line_sub
    where me.tenant_id=t.id and me.user_id=auth.uid()) and k.deleted_at is null
    and k.status in('WAITING','CALLED','ARRIVED','ADMITTED','SERVING','HOLD'))
   then raise exception '您在此場次已有有效號碼';end if;
 v_items:=private.so_menu_validate_items(t.id,'QUEUE',coalesce(p_items,'[]'::jsonb));
 v_seq:=private.so_next_ticket_number(t.id,v_day);
 insert into public.so_tickets(tenant_id,user_id,customer_name,business_date,ticket_no,number_round,number_prefix,
   selected_items,party_size,service_unit_id,service_session_id)
 values(t.id,auth.uid(),btrim(v_name),v_day,(v_seq->>'ticket_no')::int,(v_seq->>'number_round')::int,
   v_seq->>'number_prefix',v_items,p_party,s.unit_id,s.id) returning * into v_created_ticket;
 return jsonb_build_object('id',v_created_ticket.id,'number',coalesce(v_created_ticket.number_prefix,'')||v_created_ticket.ticket_no::text);
end $function$;
