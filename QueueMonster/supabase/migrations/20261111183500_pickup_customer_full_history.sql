-- Paginated customer order history scoped to authenticated user and verified store LINE link.
create or replace function public.so_pickup_my_orders(p_slug text,p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_tenant uuid;v_uid uuid:=auth.uid();v_page integer:=least(greatest(coalesce(p_page,1),1),100000);
 v_total bigint;v_rows jsonb;
begin
 if v_uid is null then raise exception '請先登入' using errcode='28000';end if;
 select id into v_tenant from public.so_tenants where slug=p_slug;
 if v_tenant is null then raise exception '找不到門市';end if;
 if not exists(select 1 from public.so_line_links l where l.tenant_id=v_tenant
   and l.user_id=v_uid) then raise exception '請先完成本店 LINE 身分綁定' using errcode='42501';end if;
 select count(*) into v_total from public.so_pickup_orders o where o.tenant_id=v_tenant and o.user_id=v_uid;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',o.id,'number','P'||lpad(o.order_no::text,5,'0'),'status',o.status,
   'items',o.items,'total',o.total,'note',o.note,'scheduled',o.scheduled,
   'pickup_at',to_char(o.pickup_at at time zone 'Asia/Taipei','YYYY-MM-DD HH24:MI'),
   'created_at',o.created_at
 ) order by o.created_at desc,o.id desc),'[]'::jsonb) into v_rows
 from (select * from public.so_pickup_orders o where o.tenant_id=v_tenant and o.user_id=v_uid
  order by o.created_at desc,o.id desc limit 25 offset (v_page-1)*25) o;
 return jsonb_build_object('total',v_total,'page',v_page,'page_size',25,'orders',v_rows);
end $$;
revoke all on function public.so_pickup_my_orders(text,integer) from public,anon;
grant execute on function public.so_pickup_my_orders(text,integer) to authenticated;