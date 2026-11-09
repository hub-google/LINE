-- Keep an existing queue visible while a shop stops accepting NEW numbers.
-- so_set_merchant_services deliberately keeps "calling" enabled when there are
-- outstanding tickets, even when "queue" becomes false.
do $audit$
declare
  v_definition text;
  v_old_board text := '      and coalesce((t.modules->>''queue'')::boolean,false)' || chr(10);
  v_old_order text := 'if t.modules->>''queue''=''false'' or t.modules->>''calling''=''false'' then';
begin
  v_definition := pg_get_functiondef('public.so_public_board(text,integer)'::regprocedure);
  if position(v_old_board in v_definition)>0 then
    execute replace(v_definition,v_old_board,'');
  elsif position('and coalesce((t.modules->>''calling'')::boolean,false)' in v_definition)=0 then
    raise exception 'Unexpected public board body; review required';
  end if;

  v_definition := pg_get_functiondef('public.so_public_queue_order(text,integer)'::regprocedure);
  if position(v_old_order in v_definition)>0 then
    execute replace(v_definition,v_old_order,'if t.modules->>''calling''=''false'' then');
  elsif position('if t.modules->>''calling''=''false'' then' in v_definition)=0 then
    raise exception 'Unexpected queue order body; review required';
  end if;
end
$audit$;
