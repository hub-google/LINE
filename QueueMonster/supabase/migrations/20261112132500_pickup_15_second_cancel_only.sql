-- Queue Monster pickup: 15-second cancel-only window. Keep server timing authoritative.
-- Customer edit RPC is removed entirely; staff order visibility and actions remain locked until release.
do $do$
declare f record; v_ddl text; v_seen int:=0;
begin
 for f in
  select p.oid,n.nspname,p.proname
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where p.prokind='f'
    and (
      (n.nspname='private' and p.proname='so_pickup_release_due')
      or (n.nspname='public' and p.proname in
       ('so_my_business_groups','so_pickup_analytics','so_pickup_calendar',
        'so_pickup_cancel','so_pickup_history','so_pickup_public_board',
        'so_pickup_staff','so_pickup_update','so_platform_overview',
        'so_staff_analytics','so_staff_customer_book'))
    )
 loop
  v_ddl:=pg_get_functiondef(f.oid);
  if position('60 seconds' in v_ddl)=0 then
   raise exception 'Expected previous 60-second release guard in %.%',f.nspname,f.proname;
  end if;
  v_ddl:=replace(replace(v_ddl,'60 seconds','15 seconds'),'60 秒','15 秒');
  execute v_ddl;
  v_seen:=v_seen+1;
 end loop;
 if v_seen<>12 then raise exception 'Expected 12 protected functions, found %',v_seen;end if;
end $do$;

-- No customer edits after submission, even from an old or tampered client.
drop function if exists public.so_pickup_edit(text,uuid,date,time,jsonb,text,boolean,text,text);

-- Realtime invalidation for merchant screens runs within ~5 seconds after the 15s grace expires.
select cron.schedule('queue-monster-pickup-release','5 seconds',
 'select private.so_pickup_release_due()');