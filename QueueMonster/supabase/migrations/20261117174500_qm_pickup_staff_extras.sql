-- Include ordering options and daily stock in the existing authorized merchant menu snapshot.
CREATE OR REPLACE FUNCTION public.so_staff_state(p_slug text, p_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.qm_tenants; v_day date:=coalesce(p_date,(now() at time zone 'Asia/Taipei')::date);v_role text;
begin
 select * into t from public.qm_tenants where slug=p_slug;
 if not found then raise exception '找不到企業';end if;
 v_role:=private.so_role(t.id);
 if v_role is null and not private.so_platform() then raise exception '沒有企業後台權限' using errcode='42501';end if;
 return jsonb_build_object('role',coalesce(v_role,'PLATFORM'),'tenant',jsonb_build_object('slug',t.slug,'name',t.name,'description',t.description,'phone',t.phone,'address',t.address,'accent',t.accent,'logo_url',t.logo_url,'directory_category',t.directory_category,'modules',t.modules,'status',t.status,'line_status',t.line_status,'oa_mode',t.oa_mode,'directory_enabled',t.directory_enabled,'onboarding_complete',t.onboarding_complete,'open_time',to_char(t.open_time,'HH24:MI'),'close_time',to_char(t.close_time,'HH24:MI'),'slot_minutes',t.slot_minutes,'slot_capacity',t.slot_capacity,
 'menu_booking_mode',t.menu_booking_mode,'menu_queue_mode',t.menu_queue_mode,
 'queue_prefix',t.queue_prefix,'queue_last_number',t.queue_last_number,'queue_round',t.queue_round,
 'booking_prefix',t.booking_prefix,'booking_last_number',t.booking_last_number,'booking_round',t.booking_round),
 'menu_items',coalesce((select jsonb_agg(jsonb_build_object(
  'id',m.id,'kind',m.kind,'name',m.name,'description',m.description,'price',m.price,
  'sort_order',m.sort_order,'active',m.active,
  'pickup_enabled',m.pickup_enabled,'pickup_sold_out',m.pickup_sold_out,'pickup_options',m.pickup_options,'pickup_daily_limit',m.pickup_daily_limit) order by m.sort_order,m.created_at)
  from public.qm_menu_items m where m.tenant_id=t.id),'[]'::jsonb),
 'date',v_day,
 'reservations',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'number',coalesce(r.booking_prefix,'')||r.booking_no::text,'name',r.customer_name,'phone',r.customer_phone,'party',r.party_size,'time',to_char(r.booking_time,'HH24:MI'),'status',r.status,'created_at',r.created_at,'selected_items',r.selected_items) order by r.booking_time,r.created_at) from public.qm_reservations r where r.tenant_id=t.id and r.deleted_at is null and r.booking_date=v_day),'[]'::jsonb),
 'tickets',coalesce((select jsonb_agg(jsonb_build_object('id',k.id,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,'name',k.customer_name,'status',k.status,'source',k.source,'reservation_id',k.reservation_id,'created_at',k.created_at,'selected_items',k.selected_items,'party',k.party_size) order by k.ticket_no) from public.qm_tickets k where k.tenant_id=t.id and k.deleted_at is null and k.business_date=v_day),'[]'::jsonb),
 'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'role',m.role,'email',u.email) order by m.joined_at) from public.qm_members m join auth.users u on u.id=m.user_id where m.tenant_id=t.id),'[]'::jsonb),
 'invites',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'email',i.email,'role',i.role) order by i.created_at desc) from public.qm_invites i where i.tenant_id=t.id and i.accepted_at is null),'[]'::jsonb));
end$function$
;
