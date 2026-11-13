-- Verified regression: a PASSED/overdue ticket can still be restored to WAITING,
-- but both legacy and multi-unit customer take-number RPCs omitted PASSED from
-- their active-identity check. This allowed two recoverable tickets per customer.
-- Existing tickets are not updated; only future issuance rules are tightened.
CREATE OR REPLACE FUNCTION public.so_take_number_with_items(p_slug text, p_name text, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.qm_tenants; v_day date:=(now() at time zone 'Asia/Taipei')::date;v_seq jsonb; k public.qm_tickets;v_items jsonb;
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 select * into t from public.qm_tenants where slug=p_slug and status='ACTIVE' for update;
 if not found or t.modules->>'queue'<>'true' then raise exception '未開放取號';end if;
 select nullif(btrim(l.display_name),'') into p_name from public.qm_line_links l where l.tenant_id=t.id and l.user_id=auth.uid() and l.display_name is not null;
 if p_name is null then raise exception '請先完成 LINE 身分授權';end if;

 
 if exists(select 1 from public.qm_tickets where tenant_id=t.id and business_date=v_day and user_id in (select linked.user_id from public.qm_line_links active_link join public.qm_line_links linked on linked.tenant_id=active_link.tenant_id and linked.line_sub=active_link.line_sub where active_link.user_id=auth.uid() and active_link.tenant_id=t.id) and deleted_at is null and status in('WAITING','HOLD','CALLED','ARRIVED','ADMITTED','SERVING','PASSED')) then raise exception '您已有有效的候位號碼';end if;
 v_items:=private.so_menu_validate_items(t.id,'QUEUE',p_items);
 v_seq:=private.so_next_ticket_number(t.id,v_day);
 insert into public.qm_tickets(tenant_id,user_id,customer_name,business_date,ticket_no,number_round,number_prefix,selected_items)
 values(t.id,auth.uid(),trim(p_name),v_day,(v_seq->>'ticket_no')::int,(v_seq->>'number_round')::int,v_seq->>'number_prefix',v_items) returning * into k;
 return jsonb_build_object('id',k.id,'number',coalesce(k.number_prefix,'')||k.ticket_no::text);
end$function$
;

CREATE OR REPLACE FUNCTION public.so_unit_take_number(p_slug text, p_session_id uuid, p_party integer, p_items jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.qm_tenants;s public.qm_service_sessions;v_created_ticket public.qm_tickets;
 v_seq jsonb;v_name text;v_items jsonb;v_day date:=(now() at time zone 'Asia/Taipei')::date;
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 if p_party not between 1 and 20 then raise exception '取號人數需介於 1～20';end if;
 select * into t from public.qm_tenants where slug=p_slug and status='ACTIVE' for update;
 if not found or not t.multi_unit_enabled or t.modules->>'queue'<>'true' then raise exception '門市未開放此種取號';end if;
 select * into s from public.qm_service_sessions where tenant_id=t.id and id=p_session_id and active;
 if not found or s.session_date<>v_day or now() at time zone 'Asia/Taipei' < (s.session_date+s.start_time)::timestamp - interval '3 hours'
   or now() at time zone 'Asia/Taipei' > (s.session_date+s.end_time)::timestamp then raise exception '此服務場次目前未開放取號';end if;
 select display_name into v_name from public.qm_line_links where tenant_id=t.id and user_id=auth.uid() and display_name is not null limit 1;
 if v_name is null then raise exception '請先完成 LINE 驗證';end if;
 if exists(select 1 from public.qm_tickets k where k.tenant_id=t.id and k.service_session_id=s.id
   and k.user_id in(select linked.user_id from public.qm_line_links me
    join public.qm_line_links linked on linked.tenant_id=me.tenant_id and linked.line_sub=me.line_sub
    where me.tenant_id=t.id and me.user_id=auth.uid()) and k.deleted_at is null
    and k.status in('WAITING','CALLED','ARRIVED','ADMITTED','SERVING','HOLD','PASSED'))
   then raise exception '您在此場次已有有效號碼';end if;
 v_items:=private.so_menu_validate_items(t.id,'QUEUE',coalesce(p_items,'[]'::jsonb));
 v_seq:=private.so_next_ticket_number(t.id,v_day);
 insert into public.qm_tickets(tenant_id,user_id,customer_name,business_date,ticket_no,number_round,number_prefix,
   selected_items,party_size,service_unit_id,service_session_id)
 values(t.id,auth.uid(),btrim(v_name),v_day,(v_seq->>'ticket_no')::int,(v_seq->>'number_round')::int,
   v_seq->>'number_prefix',v_items,p_party,s.unit_id,s.id) returning * into v_created_ticket;
 return jsonb_build_object('id',v_created_ticket.id,'number',coalesce(v_created_ticket.number_prefix,'')||v_created_ticket.ticket_no::text);
end $function$
;
