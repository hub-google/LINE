-- Pickup item / production-hour / punctuality reports; values are order face amounts, not confirmed payments.
create or replace function public.so_pickup_analytics(p_slug text,p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.so_tenants;v_start date;v_end date:=(now() at time zone 'Asia/Taipei')::date;
 v_popular jsonb:='[]'::jsonb;v_hours jsonb:='[]'::jsonb;
 v_on_time bigint:=0;v_has_ready bigint:=0;v_ready_total bigint:=0;
begin
 if auth.uid() is null then raise exception '請先登入' using errcode='28000';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '門市不存在' using errcode='22023';end if;
 if coalesce(private.so_role(t.id),'') not in ('OWNER','MANAGER') and not coalesce(private.so_platform(),false)
 then raise exception '只有店家管理者可以查看營運分析' using errcode='42501';end if;
 if p_days not in (7,30,90) then raise exception '請選擇 7、30 或 90 天';end if;
 v_start:=v_end-p_days+1;

 select coalesce(jsonb_agg(jsonb_build_object('name',i.name,'quantity',i.qty,'amount',i.amount)
    order by i.qty desc,i.amount desc),'[]'::jsonb) into v_popular from (
   select line.value->>'name' as name,
    sum((line.value->>'qty')::numeric) as qty,
    sum((line.value->>'amount')::numeric) as amount
   from public.so_pickup_orders o
   cross join lateral jsonb_array_elements(o.items) line
   where o.tenant_id=t.id and o.status not in ('REJECTED','CANCELLED')
    and (o.pickup_at at time zone 'Asia/Taipei')::date between v_start and v_end
   group by line.value->>'name'
   order by qty desc,amount desc
   limit 10
 ) i;
 select coalesce(jsonb_agg(jsonb_build_object('hour',h.hour,'orders',h.orders,'amount',h.amount)
    order by h.hour),'[]'::jsonb) into v_hours from (
   select to_char(o.pickup_at at time zone 'Asia/Taipei','HH24') as hour,
    count(*)::integer as orders,coalesce(sum(o.total),0) as amount
   from public.so_pickup_orders o
   where o.tenant_id=t.id and o.status not in ('REJECTED','CANCELLED')
    and (o.pickup_at at time zone 'Asia/Taipei')::date between v_start and v_end
   group by to_char(o.pickup_at at time zone 'Asia/Taipei','HH24')
 ) h;
 select count(*) filter (where ready.first_ready is not null),
   count(*) filter (where ready.first_ready <= o.pickup_at),
   count(*)
 into v_has_ready,v_on_time,v_ready_total
 from public.so_pickup_orders o
 left join lateral (
   select min(a.created_at) first_ready from public.so_audit a
   where a.tenant_id=o.tenant_id and a.action='pickup_order_status'
    and a.info->>'order_id'=o.id::text and a.info->>'to'='READY'
 ) ready on true
 where o.tenant_id=t.id and o.status in ('READY','PICKED_UP')
   and (o.pickup_at at time zone 'Asia/Taipei')::date between v_start and v_end;
 return jsonb_build_object('popular_items',v_popular,'pickup_hours',v_hours,
   'on_time',v_on_time,'ready_recorded',v_has_ready,'completed_or_ready',v_ready_total);
end $$;
revoke all on function public.so_pickup_analytics(text,integer) from public,anon;
grant execute on function public.so_pickup_analytics(text,integer) to authenticated;