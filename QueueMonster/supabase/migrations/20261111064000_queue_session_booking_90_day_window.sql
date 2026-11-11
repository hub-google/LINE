-- Align active customer 90-day session calendar and rescheduling with booking creation.
CREATE OR REPLACE FUNCTION public.so_unit_book_once(p_slug text, p_session_id uuid, p_name text, p_phone text, p_party integer, p_items jsonb, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants;s public.so_service_sessions; r public.so_reservations;
 v_name text:=btrim(coalesce(p_name,''));v_phone text:=regexp_replace(coalesce(p_phone,''),'[[:space:]() -]','','g');
 v_items jsonb;v_user uuid:=auth.uid();v_today date:=(now() at time zone 'Asia/Taipei')::date;
 v_count integer;v_policy public.so_booking_policy;v_lname text;
begin
 if v_user is null then raise exception '請先完成 LINE 身分驗證';end if;
 if p_request_id is null then raise exception '請重新提交預約';end if;
 if length(v_name) not between 1 and 60 or v_name ~ '[[:cntrl:]]' then raise exception '姓名必須介於 1～60 字';end if;
 if v_phone ~ '^\+8869[0-9]{8}$' then v_phone:='0'||substring(v_phone from 5);end if;
 if v_phone !~ '^09[0-9]{8}$' then raise exception '請輸入有效手機號碼';end if;
 if p_party not between 1 and 20 then raise exception '人數必須介於 1～20';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE' for update;
 if not found or not t.multi_unit_enabled or t.modules->>'reservation'<>'true' then raise exception '店家未開放多服務單位預約';end if;
 select display_name into v_lname from public.so_line_links where tenant_id=t.id and user_id=v_user and display_name is not null limit 1;
 if v_lname is null then raise exception '請先完成 LINE 身分綁定';end if;
 select * into r from public.so_reservations where tenant_id=t.id and user_id=v_user and client_request_id=p_request_id;
 if found then
   if r.service_session_id is distinct from p_session_id or r.party_size<>p_party or r.customer_name<>v_name or
      r.customer_phone is distinct from v_phone then raise exception '預約內容已變更，請重新提交';end if;
   return jsonb_build_object('id',r.id,'status',r.status,'replayed',true);
 end if;
 select * into s from public.so_service_sessions where id=p_session_id and tenant_id=t.id and active for update;
 if not found then raise exception '此場次不存在或已停用';end if;
 if s.session_date<v_today or s.session_date>v_today+90 then raise exception '日期不在可預約範圍（90 天內）';end if;
 if (s.session_date+s.start_time)::timestamp <= (now() at time zone 'Asia/Taipei') then raise exception '本場次已開始，請聯絡櫃台';end if;
 if not exists(select 1 from public.so_booking_resources where tenant_id=t.id and id=s.unit_id and active)
   then raise exception '此服務單位已停用';end if;
 v_items:=private.so_menu_validate_items(t.id,'BOOKING',coalesce(p_items,'[]'::jsonb));
 select count(*) into v_count from public.so_reservations
   where tenant_id=t.id and service_session_id=s.id and deleted_at is null and status in('CONFIRMED','CHECKED_IN');
 -- Party capacity is calculated by people, not just number of reservation rows.
 if (select coalesce(sum(party_size),0) from public.so_reservations
     where tenant_id=t.id and service_session_id=s.id and deleted_at is null
       and status in('CONFIRMED','CHECKED_IN'))+p_party>s.capacity then raise exception '此場次名額已滿';end if;
 insert into public.so_reservations(tenant_id,user_id,customer_name,customer_phone,party_size,
   booking_date,booking_time,selected_items,client_request_id,service_unit_id,service_session_id)
 values(t.id,v_user,v_name,v_phone,p_party,s.session_date,s.start_time,v_items,p_request_id,s.unit_id,s.id)
 returning * into r;
 return jsonb_build_object('id',r.id,'status',r.status,'replayed',false);
end $function$
;
