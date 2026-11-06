CREATE OR REPLACE FUNCTION public.so_staff_state(p_slug text, p_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants; v_day date:=coalesce(p_date,(now() at time zone 'Asia/Taipei')::date);v_role text;
begin
 select * into t from public.so_tenants where slug=p_slug;
 if not found then raise exception '找不到企業';end if;
 v_role:=private.so_role(t.id);
 if v_role is null and not private.so_platform() then raise exception '沒有企業後台權限' using errcode='42501';end if;
 return jsonb_build_object('role',coalesce(v_role,'PLATFORM'),'tenant',jsonb_build_object('slug',t.slug,'name',t.name,'description',t.description,'phone',t.phone,'address',t.address,'accent',t.accent,'logo_url',t.logo_url,'modules',t.modules,'status',t.status,'line_status',t.line_status,'open_time',to_char(t.open_time,'HH24:MI'),'close_time',to_char(t.close_time,'HH24:MI'),'slot_minutes',t.slot_minutes,'slot_capacity',t.slot_capacity),
 'date',v_day,
 'reservations',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.customer_name,'party',r.party_size,'time',to_char(r.booking_time,'HH24:MI'),'status',r.status) order by r.booking_time,r.created_at) from public.so_reservations r where r.tenant_id=t.id and r.booking_date=v_day),'[]'::jsonb),
 'tickets',coalesce((select jsonb_agg(jsonb_build_object('id',k.id,'number','A'||lpad(k.ticket_no::text,3,'0'),'name',k.customer_name,'status',k.status,'source',k.source,'reservation_id',k.reservation_id,'created_at',k.created_at) order by k.ticket_no) from public.so_tickets k where k.tenant_id=t.id and k.business_date=v_day),'[]'::jsonb),
 'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'role',m.role,'email',u.email) order by m.joined_at) from public.so_members m join auth.users u on u.id=m.user_id where m.tenant_id=t.id),'[]'::jsonb),
 'invites',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'email',i.email,'role',i.role) order by i.created_at desc) from public.so_invites i where i.tenant_id=t.id and i.accepted_at is null),'[]'::jsonb));
end$function$
