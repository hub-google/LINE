-- When changing items or notes, preserve an existing scheduled slot even if its minimum lead time has elapsed.
do $do$
declare v_def text;v_new text;
begin
 select pg_get_functiondef(p.oid) into v_def from pg_proc p
 join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='so_pickup_edit';
 v_new:=replace(v_def,
  'if v_pickup<now()+make_interval(mins=>s.min_notice_minutes) then',
  'if v_pickup<now()+make_interval(mins=>s.min_notice_minutes) and (not o.scheduled or v_pickup<>o.pickup_at) then');
 if v_new=v_def then raise exception 'Pickup edit lead time patch mismatch';end if;
 execute v_new;
end $do$;