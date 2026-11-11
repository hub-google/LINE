-- Pickup progress board shares the existing store-wide Realtime invalidation topic.
-- It exposes only order numbers and preparation state; never names, phones, items or user identifiers.
create or replace function public.so_pickup_public_board(p_slug text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.so_tenants;v_ready jsonb;v_preparing jsonb;v_count int;
begin
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '找不到門市' using errcode='22023';end if;
 select coalesce(jsonb_agg(jsonb_build_object('number','P'||lpad(o.order_no::text,5,'0'),
  'pickup_time',to_char(o.pickup_at at time zone 'Asia/Taipei','HH24:MI'),'status','READY')
  order by o.pickup_at,o.id),'[]'::jsonb) into v_ready
 from (select * from public.so_pickup_orders where tenant_id=t.id and status='READY'
    and pickup_at>=now()-interval '24 hours' and pickup_at<now()+interval '24 hours'
    order by pickup_at,id limit 30) o;
 select coalesce(jsonb_agg(jsonb_build_object('number','P'||lpad(o.order_no::text,5,'0'),
   'pickup_time',to_char(o.pickup_at at time zone 'Asia/Taipei','HH24:MI'),'status',o.status)
   order by o.pickup_at,o.id),'[]'::jsonb) into v_preparing
 from (select * from public.so_pickup_orders where tenant_id=t.id
    and status in ('ACCEPTED','PREPARING')
    and pickup_at>=now()-interval '12 hours' and pickup_at<=now()+interval '2 hours'
    order by pickup_at,id limit 30) o;
 select count(*) into v_count from public.so_pickup_orders where tenant_id=t.id and status='NEW'
   and pickup_at>=now()-interval '12 hours' and pickup_at<now()+interval '2 hours';
 return jsonb_build_object('store',jsonb_build_object('name',t.name,'logo_url',t.logo_url,'accent',t.accent),
   'ready',v_ready,'preparing',v_preparing,'pending_count',v_count,
   'checked_at',now());
end $$;
revoke all on function public.so_pickup_public_board(text) from public;
grant execute on function public.so_pickup_public_board(text) to anon,authenticated;

create or replace function private.so_notify_pickup_live_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_slug text;
begin
 if tg_op='UPDATE' and row(new.status,new.pickup_at,new.items,new.tenant_id)
   is not distinct from row(old.status,old.pickup_at,old.items,old.tenant_id) then return null;end if;
 select slug into v_slug from public.so_tenants where id=case when tg_op='DELETE' then old.tenant_id else new.tenant_id end and status='ACTIVE';
 if v_slug is not null then
  perform realtime.send(jsonb_build_object('changed',true,'kind','pickup'),
   'invalidate','queue-board:'||v_slug,false);
 end if;
 return null;
end $$;
revoke all on function private.so_notify_pickup_live_change() from public,anon,authenticated;
drop trigger if exists so_pickup_live_invalidate on public.so_pickup_orders;
create trigger so_pickup_live_invalidate after insert or update or delete on public.so_pickup_orders
for each row execute function private.so_notify_pickup_live_change();
