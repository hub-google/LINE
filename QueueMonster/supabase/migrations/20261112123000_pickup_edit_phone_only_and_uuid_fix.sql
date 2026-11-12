-- Follow-up: preserve phone-only checkout contact when customer edits, and validate UUID correctly.
do $do$
declare v_def text;v_new text;
begin
 select pg_get_functiondef(p.oid) into v_def
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='so_pickup_edit';
 if v_def is null then raise exception 'so_pickup_edit not found';end if;
 v_new:=replace(v_def,
  'if length(v_name) not between 1 and 60 or v_name~''[[:cntrl:]<>]'' or v_name~''^[0-9]+$'' then',
  'if v_name<>'''' and (length(v_name)>60 or v_name~''[[:cntrl:]<>]'' or v_name~''^[0-9]+$'') then');
 v_new:=replace(v_new,
  'customer_name=v_name,customer_phone=v_phone',
  'customer_name=case when v_name='''' then o.customer_name else v_name end,customer_phone=v_phone');
 v_new:=replace(v_new,
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}',
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}');
 if v_new=v_def or position('customer_name=case when' in v_new)=0 then
   raise exception 'Expected pickup edit patch points not found';
 end if;
 execute v_new;
end $do$;