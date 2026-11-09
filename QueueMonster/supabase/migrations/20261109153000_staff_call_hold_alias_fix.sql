-- Repair Queue Monster live staff "call" action SQL alias shadowing.
-- Keep all existing authorization, queue state rules and data untouched.
do $audit$
declare
  v_definition text;
  v_start integer;
  v_end integer;
  v_original text;
  v_fixed text;
begin
  v_definition := pg_get_functiondef('public.so_staff_action(text,text,uuid,uuid)'::regprocedure);
  if position('update public.so_tickets hold_ticket set' in v_definition)>0 then
    return;
  end if;
  v_start := position('update public.so_tickets k set' in v_definition);
  if v_start=0 then
    raise exception 'Unexpected so_staff_action() body; manual review required';
  end if;
  v_end := position(';' in substring(v_definition from v_start));
  if v_end=0 then
    raise exception 'Cannot isolate HOLD expiry UPDATE';
  end if;
  v_original := substring(v_definition from v_start for v_end);
  if position('k.hold_until' in v_original)=0
      or position('k.tenant_id' in v_original)=0 then
    raise exception 'Queue call SQL did not match expected structure';
  end if;
  v_fixed := replace(v_original,'update public.so_tickets k set',
                     'update public.so_tickets hold_ticket set');
  v_fixed := replace(v_fixed,'k.','hold_ticket.');
  execute replace(v_definition,v_original,v_fixed);
end
$audit$;
