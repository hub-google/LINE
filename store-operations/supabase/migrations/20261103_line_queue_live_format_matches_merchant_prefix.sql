-- Keep queue snapshots and detail consistent with merchant prefixes and unpadded numbers.
create or replace function private.so_refresh_queue_display(p_tenant uuid)
returns void language plpgsql security definer set search_path = ''
as $function$
declare
 v_called text;
 v_waiting integer;
 v_serving integer;
begin
 -- Active call wins; after a call is completed, keep the most recently called
 -- number visible briefly, including across midnight.
 select coalesce(k.number_prefix,'')||k.ticket_no::text into v_called
 from public.so_tickets k
 where k.tenant_id=p_tenant and k.deleted_at is null
   and k.status in ('CALLED','SERVING')
 order by k.last_called_at desc nulls last,k.updated_at desc,k.created_at desc
 limit 1;
 if v_called is null then
   select coalesce(k.number_prefix,'')||k.ticket_no::text into v_called
   from public.so_tickets k
   where k.tenant_id=p_tenant and k.deleted_at is null
     and k.last_called_at>=now()-interval '24 hours'
   order by k.last_called_at desc,k.created_at desc limit 1;
 end if;
 select count(*)::integer into v_waiting from public.so_tickets
 where tenant_id=p_tenant and deleted_at is null and status='WAITING';
 select count(*)::integer into v_serving from public.so_tickets
 where tenant_id=p_tenant and deleted_at is null and status in ('CALLED','SERVING');
 insert into public.so_queue_displays(tenant_id,current_number,waiting_count,serving_count,updated_at)
 values(p_tenant,v_called,v_waiting,v_serving,now())
 on conflict (tenant_id) do update set
   current_number=excluded.current_number,
   waiting_count=excluded.waiting_count,
   serving_count=excluded.serving_count,
   updated_at=excluded.updated_at
 where so_queue_displays.current_number is distinct from excluded.current_number
   or so_queue_displays.waiting_count is distinct from excluded.waiting_count
   or so_queue_displays.serving_count is distinct from excluded.serving_count;
end $function$;

create or replace function public.so_queue_live(p_slug text,p_ticket_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = ''
as $function$
declare
 t public.so_tenants;
 d public.so_queue_displays;
 k public.so_tickets;
 v_ahead integer;
 v_viewer uuid:=auth.uid();
begin
 if v_viewer is null then raise exception '請先登入 LINE';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '找不到門市';end if;
 select * into d from public.so_queue_displays where tenant_id=t.id;
 if p_ticket_id is not null then
   select ticket.* into k
   from public.so_tickets ticket
   where ticket.tenant_id=t.id and ticket.id=p_ticket_id
     and ticket.deleted_at is null
     and exists (
       select 1 from public.so_line_links viewer
       join public.so_line_links linked on linked.tenant_id=viewer.tenant_id
         and linked.line_sub=viewer.line_sub
       where viewer.tenant_id=t.id and viewer.user_id=v_viewer
         and linked.user_id=ticket.user_id
     );
 end if;
 if k.id is not null and k.status='WAITING' then
   select count(*)::integer into v_ahead from public.so_tickets ahead
   where ahead.tenant_id=t.id and ahead.deleted_at is null
     and ahead.status='WAITING'
     and (ahead.created_at,ahead.id)<(k.created_at,k.id);
   v_ahead:=v_ahead+coalesce(d.serving_count,0);
 elsif k.id is not null and k.status in ('CALLED','SERVING') then
   v_ahead:=0;
 else
   v_ahead:=null;
 end if;
 return jsonb_build_object(
   'tenant_id',t.id,'shop_name',t.name,
   'current',d.current_number,
   'waiting',coalesce(d.waiting_count,0),
   'serving',coalesce(d.serving_count,0),
   'updated_at',d.updated_at,
   'mine',case when k.id is null then null else jsonb_build_object(
     'id',k.id,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,
     'status',k.status,'ahead',v_ahead,
     'created_at',k.created_at
   ) end
 );
end $function$;

revoke all on function public.so_queue_live(text,uuid) from public,anon;
grant execute on function public.so_queue_live(text,uuid) to authenticated;
do $backfill$
declare item record;
begin
 for item in select id from public.so_tenants loop
   perform private.so_refresh_queue_display(item.id);
 end loop;
end $backfill$;
