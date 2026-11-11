-- Dedicated, tenant-scoped pickup calendar; does not depend on a 300-row operational snapshot.
create or replace function public.so_pickup_calendar(
  p_slug text,p_start date,p_end date,p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.so_tenants;v_page integer:=least(greatest(coalesce(p_page,1),1),100000);
  v_total bigint;v_amount numeric;v_rows jsonb;
begin
 if auth.uid() is null then raise exception '請先登入' using errcode='28000';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '找不到門市';end if;
 if private.so_role(t.id) is null and not coalesce(private.so_platform(),false) then
  raise exception '沒有這家店的操作權限' using errcode='42501';end if;
 if p_start is null or p_end is null or p_end<p_start or p_end>p_start+41 then
  raise exception '取餐日曆僅能查詢 42 天內的有效期間' using errcode='22023';end if;
 select count(*),coalesce(sum(total),0) into v_total,v_amount
 from public.so_pickup_orders o where o.tenant_id=t.id and o.scheduled
 and (o.pickup_at at time zone 'Asia/Taipei')::date between p_start and p_end
 and o.status not in ('REJECTED','CANCELLED');
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',o.id,'number','P'||lpad(o.order_no::text,5,'0'),
   'pickup_at',to_char(o.pickup_at at time zone 'Asia/Taipei','YYYY-MM-DD HH24:MI'),
   'status',o.status,'items',o.items,'total',o.total
 ) order by o.pickup_at,o.id),'[]'::jsonb) into v_rows
 from (select * from public.so_pickup_orders o where o.tenant_id=t.id and o.scheduled
   and (o.pickup_at at time zone 'Asia/Taipei')::date between p_start and p_end
   and o.status not in ('REJECTED','CANCELLED')
   order by o.pickup_at,o.id limit 100 offset (v_page-1)*100) o;
 return jsonb_build_object('total',v_total,'amount',v_amount,
   'page',v_page,'page_size',100,'orders',v_rows);
end $$;
revoke all on function public.so_pickup_calendar(text,date,date,integer) from public,anon;
grant execute on function public.so_pickup_calendar(text,date,date,integer) to authenticated;
