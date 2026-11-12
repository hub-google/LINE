-- Apply the same Taiwan mobile and geographic landline numbering rules at the RPC boundary.
-- Reference: government national telecommunications numbering plan (02/03/037/04/049/...).
create or replace function private.so_normalize_tw_phone(p_phone text)
returns text language sql immutable set search_path = '' as $$
 select case when left(v,4)='+886' then '0'||substr(v,5) else v end
 from (select regexp_replace(btrim(coalesce(p_phone,'')), '[[:space:]()-]', '', 'g') as v) x;
$$;

create or replace function private.so_valid_tw_phone(p_phone text)
returns boolean language sql immutable set search_path = '' as $$
 select coalesce(private.so_normalize_tw_phone(p_phone) ~
 '^(09[0-9]{8}|02[235678][0-9]{7}|03[2-689][0-9]{6}|037[2-9][0-9]{5}|04[23][0-9]{7}|04[78][0-9]{6}|049[2-9][0-9]{6}|05[2-7][0-9]{6}|06[235679][0-9]{6}|07[2-9][0-9]{6}|08[478][0-9]{6}|082[2-57-9][0-9]{5}|08266[0-9]{4}|0836[2-9][0-9]{4}|089[2-9][0-9]{5})$',false);
$$;

revoke all on function private.so_normalize_tw_phone(text) from public,anon,authenticated;
revoke all on function private.so_valid_tw_phone(text) from public,anon,authenticated;

create or replace function public.so_pickup_place_contact(
 p_slug text,p_date date,p_time time,p_items jsonb,p_note text,p_request_id uuid,p_immediate boolean,
 p_customer_name text,p_customer_phone text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_result jsonb;
 v_tenant uuid;
 v_name text:=btrim(coalesce(p_customer_name,''));
 v_phone text:=private.so_normalize_tw_phone(p_customer_phone);
begin
 if auth.uid() is null then raise exception '請先登入' using errcode='28000';end if;
 if length(v_name) not between 1 and 60 or v_name~'[[:cntrl:]<>]' or v_name ~ '^[0-9]+$'
   then raise exception '請填寫有效的取餐姓名' using errcode='22023';end if;
 if not private.so_valid_tw_phone(v_phone) then
   raise exception '請填寫有效的台灣手機或市話（手機 09 開頭 10 碼；市話需含區碼）' using errcode='22023';
 end if;
 select id into v_tenant from public.so_tenants where slug=p_slug and status='ACTIVE';
 if v_tenant is null then raise exception '門市不存在' using errcode='22023';end if;
 select public.so_pickup_place(p_slug,p_date,p_time,p_items,p_note,p_request_id,p_immediate) into v_result;
 update public.so_pickup_orders set customer_name=v_name,customer_phone=v_phone,updated_at=now()
 where tenant_id=v_tenant and id=(v_result->>'id')::uuid and user_id=auth.uid()
   and coalesce((v_result->>'existing')::boolean,false)=false;
 return v_result;
end $$;
revoke all on function public.so_pickup_place_contact(text,date,time,jsonb,text,uuid,boolean,text,text) from public,anon;
grant execute on function public.so_pickup_place_contact(text,date,time,jsonb,text,uuid,boolean,text,text) to authenticated;
